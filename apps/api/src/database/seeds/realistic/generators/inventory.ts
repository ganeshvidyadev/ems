import { addMs, MS_HOUR, MS_MINUTE } from '../dates';
import type { CatalogModel, ProductModel, VariantModel } from './catalog';
import { slotKey } from './catalog';
import type { Ctx } from './context';
import type { CoreModel } from './core';
import type { Allocation, LineModel, OrderModel } from './order-types';

export type MovementType = 'PURCHASE' | 'SALE' | 'RETURN' | 'ADJUSTMENT' | 'DAMAGE' | 'RESERVATION' | 'RELEASE' | 'COUNT_CORRECTION' | 'EXPIRY';

export interface MovementModel {
  nk: string;
  ts: Date;
  warehouse: string;
  product: ProductModel;
  variant: VariantModel | null;
  type: MovementType;
  delta: number;
  after: number;
  refType: string | null;
  /** Natural key of the referenced order / shipment / return, resolved by the writer. */
  refOrder: string | null;
  refShipment: string | null;
  refReturn: string | null;
  /** Owner for idempotency: an order number (order-driven movement) or a level nk (stock-keeping movement). */
  ownerOrder: string | null;
  ownerLevel: string;
  reason: string | null;
  unitCostMinor: number | null;
  performedByStaff: string | null;
}

export interface LevelModel {
  nk: string;
  warehouse: string;
  product: ProductModel;
  variant: VariantModel | null;
  onHand: number;
  reserved: number;
  incoming: number;
  reorderPoint: number;
  reorderQty: number;
  bin: string;
  lastCountedAt: Date | null;
  createdAt: Date;
}

export interface InventoryResult {
  levels: LevelModel[];
  movements: MovementModel[];
  archetypeCounts: Record<string, number>;
}

type EventKind = 'RESERVE' | 'RELEASE' | 'SALE' | 'CANCEL_RESTOCK' | 'RTO_RETURN' | 'RETURN_RESTOCK';

interface StockEvent {
  seq: number;
  at: Date;
  kind: EventKind;
  order: OrderModel;
  line: LineModel;
  qty: number;
  shipment?: string;
  rma?: string;
}

/** The first `qty` units of a line's allocation, in picking order (same semantics as `allocationRange`). */
function takeUnits(allocations: Allocation[], qty: number): Allocation[] {
  const out: Allocation[] = [];
  let remaining = qty;
  for (const a of allocations) {
    if (remaining <= 0) break;
    const take = Math.min(a.qty, remaining);
    if (take > 0) out.push({ warehouse: a.warehouse, qty: take });
    remaining -= take;
  }
  return out;
}

interface WhState {
  warehouse: string;
  onHand: number;
  reserved: number;
  incoming: number;
  lastTs: Date;
  moves: number;
  counted: Date | null;
}

interface Slot {
  key: string;
  product: ProductModel;
  variant: VariantModel | null;
  states: WhState[];
  events: StockEvent[];
}

/**
 * Replays every order's stock effects in time order, producing the ledger and the final levels.
 *
 * Mirrors the application's own movement semantics: a reservation raises `reserved`; confirming
 * commits it (on-hand and reserved both fall, a SALE movement); cancelling before confirmation
 * releases it; cancelling after confirmation restocks via ADJUSTMENT/ORDER_CANCEL; a return-to-origin
 * and a resellable return add a RETURN movement. `quantity_after` is the reserved count for
 * RESERVATION/RELEASE rows and the on-hand count for everything else, exactly like the service.
 * When a reservation would exceed stock, a supplier receipt (PURCHASE) arrives first, so stock never
 * goes negative.
 */
export function buildInventory(ctx: Ctx, core: CoreModel, catalog: CatalogModel, orders: OrderModel[]): InventoryResult {
  const primary = core.warehouses[0]!.code;
  const secondary = core.warehouses[1]?.code ?? primary;
  const stockStaff = 'stock';

  // --- Slots ------------------------------------------------------------------------------
  const slots = new Map<string, Slot>();
  const ensureSlot = (product: ProductModel, variant: VariantModel | null): Slot => {
    const key = slotKey(product, variant);
    let slot = slots.get(key);
    if (!slot) {
      slot = { key, product, variant, states: [], events: [] };
      const codes = product.secondaryOnly ? [secondary] : product.hasSecondary ? [primary, secondary] : [primary];
      for (const code of codes) slot.states.push({ warehouse: code, onHand: 0, reserved: 0, incoming: 0, lastTs: product.createdAt, moves: 0, counted: null });
      slots.set(key, slot);
    }
    return slot;
  };
  for (const product of catalog.products) {
    if (product.type === 'VARIABLE') for (const v of product.variants) ensureSlot(product, v);
    else ensureSlot(product, null);
  }

  // --- Events -----------------------------------------------------------------------------
  let seq = 0;
  const push = (kind: EventKind, at: Date, order: OrderModel, line: LineModel, qty: number, extra: { shipment?: string; rma?: string } = {}): void => {
    if (qty <= 0) return;
    const slot = slots.get(slotKey(line.product, line.variant))!;
    slot.events.push({ seq: (seq += 1), at, kind, order, line, qty, ...extra });
  };
  for (const order of orders) {
    for (const line of order.lines) {
      push('RESERVE', order.reservedAt, order, line, line.qty);
      if (order.committedAt) push('SALE', order.committedAt, order, line, line.qty);
      if (order.releasedAt) push('RELEASE', order.releasedAt, order, line, line.qty);
      if (order.cancelRestockAt) push('CANCEL_RESTOCK', order.cancelRestockAt, order, line, line.qty);
      if (order.rtoAt) push('RTO_RETURN', order.rtoAt, order, line, line.qty, { shipment: order.shipments[0]?.number });
    }
    for (const ret of order.returns) {
      if (ret.status !== 'COMPLETED' || ret.inspection !== 'RESELLABLE') continue;
      for (const item of ret.items) if (item.restock) push('RETURN_RESTOCK', ret.inspectedAt as Date, order, item.line, item.qty, { rma: ret.rma });
    }
  }

  const movements: MovementModel[] = [];
  const archetypeCounts: Record<string, number> = { healthy: 0, low: 0, oos: 0 };
  const orderedSlots = [...slots.values()];

  const levelNk = (state: WhState, slot: Slot): string => `${state.warehouse}|${slot.product.slug}|${slot.variant?.sku ?? ''}`;

  const record = (slot: Slot, state: WhState, m: Omit<MovementModel, 'nk' | 'warehouse' | 'product' | 'variant' | 'ownerLevel' | 'refShipment' | 'refReturn' | 'refOrder' | 'ownerOrder' | 'performedByStaff' | 'unitCostMinor' | 'reason' | 'refType'> & Partial<MovementModel>): void => {
    state.moves += 1;
    state.lastTs = m.ts;
    movements.push({
      nk: `${levelNk(state, slot)}|${state.moves}`,
      warehouse: state.warehouse,
      product: slot.product,
      variant: slot.variant,
      ownerLevel: levelNk(state, slot),
      refType: null,
      refOrder: null,
      refShipment: null,
      refReturn: null,
      ownerOrder: null,
      performedByStaff: null,
      unitCostMinor: null,
      reason: null,
      ...m,
    });
  };

  for (const slot of orderedSlots) {
    const rng = ctx.rng('slot', slot.key);
    const product = slot.product;
    const cost = slot.variant?.costMinor ?? product.costMinor;
    const base = Math.max(8, Math.round(product.openingStock * (0.6 + rng.float() * 0.6)));

    // Opening receipt, before the first order of the history window.
    slot.states.forEach((state, index) => {
      const qty = slot.states.length === 1 ? base : index === 0 ? base : Math.max(5, Math.round(base * 0.45));
      state.onHand = qty;
      state.counted = addMs(product.createdAt, 7 * MS_HOUR);
      record(slot, state, {
        ts: addMs(product.createdAt, 6 * MS_HOUR + index * MS_MINUTE),
        type: 'PURCHASE',
        delta: qty,
        after: state.onHand,
        refType: 'PURCHASE',
        reason: 'Opening stock received',
        unitCostMinor: cost,
        performedByStaff: stockStaff,
        ownerOrder: null,
      });
    });

    slot.events.sort((a, b) => a.at.getTime() - b.at.getTime() || a.seq - b.seq);
    const byWh = (code: string): WhState => slot.states.find((s) => s.warehouse === code)!;

    for (const ev of slot.events) {
      const orderNo = ev.order.number;
      switch (ev.kind) {
        case 'RESERVE': {
          let remaining = ev.qty;
          const allocs: Allocation[] = [];
          const candidates = [...slot.states];
          const take = (state: WhState): void => {
            const available = state.onHand - state.reserved;
            if (remaining <= 0 || available <= 0) return;
            const q = Math.min(remaining, available);
            state.reserved += q;
            allocs.push({ warehouse: state.warehouse, qty: q });
            remaining -= q;
            record(slot, state, {
              ts: ev.at,
              type: 'RESERVATION',
              delta: q,
              after: state.reserved,
              refType: 'ORDER',
              refOrder: orderNo,
              ownerOrder: orderNo,
            });
          };
          // Pass 1: whatever is on the shelves, in warehouse priority order.
          for (const state of candidates) take(state);
          if (remaining > 0) {
            // A supplier receipt lands in the primary location of this slot, then the rest is reserved.
            const target = candidates[0]!;
            const qty = Math.max(product.reorderQty, remaining + Math.ceil(product.openingStock * 0.3));
            target.onHand += qty;
            record(slot, target, {
              ts: new Date(Math.max(target.lastTs.getTime(), ev.at.getTime() - 3 * MS_HOUR)),
              type: 'PURCHASE',
              delta: qty,
              after: target.onHand,
              refType: 'PURCHASE',
              reason: `Supplier replenishment PO-${slot.product.index}-${target.moves + 1}`,
              unitCostMinor: cost,
              performedByStaff: stockStaff,
            });
            take(target);
          }
          ev.line.allocations = allocs;
          break;
        }
        case 'RELEASE': {
          for (const a of takeUnits(ev.line.allocations, ev.qty)) {
            const state = byWh(a.warehouse);
            state.reserved -= a.qty;
            record(slot, state, { ts: ev.at, type: 'RELEASE', delta: -a.qty, after: state.reserved, refType: 'ORDER', refOrder: orderNo, ownerOrder: orderNo });
          }
          break;
        }
        case 'SALE': {
          for (const a of takeUnits(ev.line.allocations, ev.qty)) {
            const state = byWh(a.warehouse);
            state.reserved -= a.qty;
            state.onHand -= a.qty;
            record(slot, state, { ts: ev.at, type: 'SALE', delta: -a.qty, after: state.onHand, refType: 'ORDER', refOrder: orderNo, ownerOrder: orderNo, unitCostMinor: cost });
          }
          break;
        }
        case 'CANCEL_RESTOCK': {
          for (const a of takeUnits(ev.line.allocations, ev.qty)) {
            const state = byWh(a.warehouse);
            state.onHand += a.qty;
            record(slot, state, { ts: ev.at, type: 'ADJUSTMENT', delta: a.qty, after: state.onHand, refType: 'ORDER_CANCEL', refOrder: orderNo, ownerOrder: orderNo });
          }
          break;
        }
        case 'RTO_RETURN': {
          for (const a of takeUnits(ev.line.allocations, ev.qty)) {
            const state = byWh(a.warehouse);
            state.onHand += a.qty;
            record(slot, state, { ts: ev.at, type: 'RETURN', delta: a.qty, after: state.onHand, refType: 'RTO', refShipment: ev.shipment ?? null, ownerOrder: orderNo });
          }
          break;
        }
        case 'RETURN_RESTOCK': {
          for (const a of takeUnits(ev.line.allocations, ev.qty)) {
            const state = byWh(a.warehouse);
            state.onHand += a.qty;
            record(slot, state, { ts: ev.at, type: 'RETURN', delta: a.qty, after: state.onHand, refType: 'RETURN', refReturn: ev.rma ?? null, ownerOrder: orderNo });
          }
          break;
        }
      }
    }

    // --- Closing position: shape the final stock to the product's inventory archetype -----------
    const primaryState = slot.states[0]!;
    const closeAt = (state: WhState, hoursBack: number): Date => new Date(Math.max(state.lastTs.getTime() + 1000, ctx.now.getTime() - hoursBack * MS_HOUR));
    if (product.archetype === 'oos') {
      for (const state of slot.states) {
        const available = state.onHand - state.reserved;
        if (available > 0) {
          state.onHand -= available;
          const type: MovementType = rng.chance(0.3) ? 'DAMAGE' : 'COUNT_CORRECTION';
          record(slot, state, {
            ts: closeAt(state, 6),
            type,
            delta: -available,
            after: state.onHand,
            refType: 'ADJUSTMENT',
            reason: type === 'DAMAGE' ? 'Remaining units written off as damaged' : 'Cycle count: shelf is empty',
            performedByStaff: stockStaff,
          });
          state.counted = ctx.now;
        }
      }
    } else if (product.archetype === 'low') {
      const target = rng.int(1, Math.max(1, product.lowStockThreshold));
      const available = primaryState.onHand - primaryState.reserved;
      if (available > target) {
        const delta = available - target;
        primaryState.onHand -= delta;
        record(slot, primaryState, {
          ts: closeAt(primaryState, 12),
          type: 'COUNT_CORRECTION',
          delta: -delta,
          after: primaryState.onHand,
          refType: 'ADJUSTMENT',
          reason: 'Cycle count correction',
          performedByStaff: stockStaff,
        });
        primaryState.counted = ctx.now;
      }
      for (const state of slot.states) if (state.warehouse !== primaryState.warehouse) {
        const spare = state.onHand - state.reserved;
        if (spare > product.lowStockThreshold) {
          state.onHand -= spare - 1;
          record(slot, state, { ts: closeAt(state, 12), type: 'COUNT_CORRECTION', delta: -(spare - 1), after: state.onHand, refType: 'ADJUSTMENT', reason: 'Cycle count correction', performedByStaff: stockStaff });
        }
      }
      primaryState.incoming = rng.chance(0.5) ? product.reorderQty : 0;
    } else {
      const available = primaryState.onHand - primaryState.reserved;
      if (available < product.lowStockThreshold * 2) {
        const qty = product.reorderQty + (product.lowStockThreshold * 2 - available);
        primaryState.onHand += qty;
        record(slot, primaryState, {
          ts: closeAt(primaryState, 30),
          type: 'PURCHASE',
          delta: qty,
          after: primaryState.onHand,
          refType: 'PURCHASE',
          reason: 'Supplier receipt',
          unitCostMinor: cost,
          performedByStaff: stockStaff,
        });
      }
    }
    archetypeCounts[product.archetype] = (archetypeCounts[product.archetype] ?? 0) + 1;
  }

  const levels: LevelModel[] = [];
  for (const slot of orderedSlots) {
    const rng = ctx.rng('level', slot.key);
    for (const state of slot.states) {
      if (state.onHand < 0 || state.reserved < 0 || state.reserved > state.onHand) {
        ctx.warnings.push(`Stock invariant violated for ${slot.key} @ ${state.warehouse}: onHand=${state.onHand} reserved=${state.reserved}`);
      }
      levels.push({
        nk: levelNk(state, slot),
        warehouse: state.warehouse,
        product: slot.product,
        variant: slot.variant,
        onHand: state.onHand,
        reserved: state.reserved,
        incoming: state.incoming,
        reorderPoint: slot.product.lowStockThreshold,
        reorderQty: slot.product.reorderQty,
        bin: `${rng.pick(['A', 'B', 'C', 'D'])}-${rng.int(1, 12)}-${rng.int(1, 6)}`,
        lastCountedAt: state.counted,
        createdAt: slot.product.createdAt,
      });
    }
  }
  movements.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  return { levels, movements, archetypeCounts };
}
