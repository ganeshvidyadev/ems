import { Injectable } from '@nestjs/common';
import type { InventoryLevelResponse, InventoryMovementResponse } from '@ems/contracts';
import { BusinessRuleError, ConflictError, NotFoundError } from '@ems/kernel';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CacheService } from '../../common/services/cache.service';
import { InventoryInsufficientError } from '../../common/errors/api.errors';
import { RequestContextService } from '../../common/services/request-context.service';
import type { InventoryLevelEntity, InventoryMovementType } from '../../database/entities';
import { ProductRepository } from '../product/product.repository';
import { InventoryLevelRepository, InventoryMovementRepository } from './inventory.repository';
import { WarehouseRepository } from './warehouse.repository';

export interface StockAllocation {
  warehouseId: string;
  quantity: number;
  levelId: string;
}

/** Public ids resolved to display back on an `InventoryLevelResponse`. */
interface ResponseIds {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  variantId: string | null;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly levels: InventoryLevelRepository,
    private readonly movements: InventoryMovementRepository,
    private readonly context: RequestContextService,
    private readonly cache: CacheService,
    private readonly products: ProductRepository,
    private readonly warehouses: WarehouseRepository,
  ) {}

  /**
   * `InventoryLevelEntity`/`InventoryMovementEntity` key everything by the
   * internal numeric FK (`NumericIdEntity.id`) — the checkout reservation
   * path above already passes those correctly, resolved once by its own
   * caller. The console-facing methods below take the *public* ULID instead
   * (matching every other console endpoint and this module's own Zod
   * contracts), so each one resolves public → internal before touching a
   * repository, and back again for anything echoed in a response.
   *
   * Found live: `adjust`/`transfer`/`upsertSettings` all 500'd with MySQL's
   * "Data truncated for column 'warehouse_id'" the first time a real
   * warehouse/product public id reached a raw parameterized INSERT/UPDATE
   * against a `bigint` column. The read paths (`listForProduct`, `low-stock`)
   * never surfaced this because MySQL's lenient implicit string→int
   * coercion on a `SELECT ... WHERE product_id = '<ulid>'` parses the ULID's
   * leading digits and, for an early-created row whose internal id is small,
   * can coincidentally match — silently correct by chance, not by design.
   */
  private async resolveProductId(publicId: string): Promise<string> {
    return (await this.products.findByPublicIdOrFail(publicId)).id;
  }

  private async resolveWarehouseId(publicId: string): Promise<string> {
    return (await this.warehouses.findByPublicIdOrFail(publicId)).id;
  }

  private async resolveVariantId(publicId: string | null): Promise<string | null> {
    if (!publicId) return null;
    const tenantId = this.context.requireTenantId('inventory variant lookup');
    const rows = (await this.manager.query(
      `SELECT id FROM product_variants WHERE tenant_id = ? AND public_id = ?`,
      [tenantId, publicId],
    )) as { id: string }[];
    if (rows.length === 0) throw new NotFoundError('ProductVariant', publicId);
    return rows[0].id;
  }

  async listForProduct(productId: string, variantId?: string | null): Promise<InventoryLevelResponse[]> {
    const internalProductId = await this.resolveProductId(productId);
    const internalVariantId = variantId === undefined ? undefined : await this.resolveVariantId(variantId);
    const rows = await this.levels.findByProduct(internalProductId, internalVariantId);
    const names = await this.warehouseNames(rows.map((r) => r.warehouseId));
    const warehousePublicIds = await this.warehousePublicIds(rows.map((r) => r.warehouseId));
    return rows.map((row) =>
      this.toResponse(row, {
        warehouseId: warehousePublicIds.get(row.warehouseId) ?? row.warehouseId,
        warehouseName: names.get(row.warehouseId) ?? row.warehouseId,
        productId,
        variantId: variantId ?? null,
      }),
    );
  }

  async upsertSettings(input: {
    warehouseId: string;
    productId: string;
    variantId: string | null;
    reorderPoint?: number | null;
    reorderQuantity?: number | null;
    binLocation?: string | null;
  }): Promise<InventoryLevelResponse> {
    const internalWarehouseId = await this.resolveWarehouseId(input.warehouseId);
    const internalProductId = await this.resolveProductId(input.productId);
    const internalVariantId = await this.resolveVariantId(input.variantId);

    const slot = await this.levels.ensureSlot({
      warehouseId: internalWarehouseId,
      productId: internalProductId,
      variantId: internalVariantId,
    });
    Object.assign(slot, {
      reorderPoint: input.reorderPoint === undefined ? slot.reorderPoint : input.reorderPoint,
      reorderQuantity: input.reorderQuantity === undefined ? slot.reorderQuantity : input.reorderQuantity,
      binLocation: input.binLocation === undefined ? slot.binLocation : input.binLocation,
    });
    await this.levels.save(slot);
    await this.cache.invalidate('inventory');

    const name = (await this.warehouseNames([slot.warehouseId])).get(slot.warehouseId) ?? input.warehouseId;
    return this.toResponse(slot, {
      warehouseId: input.warehouseId,
      warehouseName: name,
      productId: input.productId,
      variantId: input.variantId,
    });
  }

  /**
   * Manual on-hand adjustment: recount, damage, theft, expiry, correction.
   *
   * Never touches `quantity_reserved` — a damaged unit that was already
   * reserved for an open order is a fulfilment problem to resolve separately,
   * not something a stock count should silently cancel.
   */
  async adjust(input: {
    warehouseId: string;
    productId: string;
    variantId: string | null;
    quantityDelta: number;
    type: Extract<InventoryMovementType, 'ADJUSTMENT' | 'DAMAGE' | 'THEFT' | 'EXPIRY' | 'COUNT_CORRECTION'>;
    reason?: string;
    unitCostMinor?: string;
  }): Promise<InventoryLevelResponse> {
    const internalWarehouseId = await this.resolveWarehouseId(input.warehouseId);
    const internalProductId = await this.resolveProductId(input.productId);
    const internalVariantId = await this.resolveVariantId(input.variantId);

    return this.manager.transaction(async (tx) => {
      const levels = this.scopedTo(tx, this.levels);
      const movementsRepo = this.scopedTo(tx, this.movements);

      const slot = await levels.ensureSlot({
        warehouseId: internalWarehouseId,
        productId: internalProductId,
        variantId: internalVariantId,
      });
      const applied = await levels.adjustOnHand(slot.id, input.quantityDelta);
      if (!applied) {
        throw new BusinessRuleError('Adjustment would take stock below zero');
      }

      const refreshed = await levels.findOneOrFail({ where: { id: slot.id } });
      await movementsRepo.record({
        warehouseId: internalWarehouseId,
        productId: internalProductId,
        variantId: internalVariantId,
        type: input.type,
        quantityDelta: input.quantityDelta,
        quantityAfter: refreshed.quantityOnHand,
        referenceType: 'ADJUSTMENT',
        performedBy: this.context.userId,
        reason: input.reason ?? null,
        unitCostMinor: input.unitCostMinor ?? null,
        correlationId: this.context.correlationId ?? null,
      });

      await this.cache.invalidate('inventory');
      const name = await this.warehouseName(refreshed.warehouseId);
      return this.toResponse(refreshed, {
        warehouseId: input.warehouseId,
        warehouseName: name,
        productId: input.productId,
        variantId: input.variantId,
      });
    });
  }

  async transfer(input: {
    fromWarehouseId: string;
    toWarehouseId: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    reason?: string;
  }): Promise<void> {
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new BusinessRuleError('Source and destination warehouses must differ');
    }

    const internalFromWarehouseId = await this.resolveWarehouseId(input.fromWarehouseId);
    const internalToWarehouseId = await this.resolveWarehouseId(input.toWarehouseId);
    const internalProductId = await this.resolveProductId(input.productId);
    const internalVariantId = await this.resolveVariantId(input.variantId);

    await this.manager.transaction(async (tx) => {
      const levels = this.scopedTo(tx, this.levels);
      const movementsRepo = this.scopedTo(tx, this.movements);

      const source = await levels.ensureSlot({
        warehouseId: internalFromWarehouseId,
        productId: internalProductId,
        variantId: internalVariantId,
      });

      const removed = await levels.adjustOnHand(source.id, -input.quantity);
      if (!removed) throw new ConflictError('Insufficient stock at source warehouse to transfer');

      const sourceAfter = await levels.findOneOrFail({ where: { id: source.id } });
      await movementsRepo.record({
        warehouseId: internalFromWarehouseId,
        productId: internalProductId,
        variantId: internalVariantId,
        type: 'TRANSFER_OUT',
        quantityDelta: -input.quantity,
        quantityAfter: sourceAfter.quantityOnHand,
        referenceType: 'TRANSFER',
        reason: input.reason ?? null,
        performedBy: this.context.userId,
        correlationId: this.context.correlationId ?? null,
      });

      const dest = await levels.ensureSlot({
        warehouseId: internalToWarehouseId,
        productId: internalProductId,
        variantId: internalVariantId,
      });
      await levels.adjustOnHand(dest.id, input.quantity);
      const destAfter = await levels.findOneOrFail({ where: { id: dest.id } });
      await movementsRepo.record({
        warehouseId: internalToWarehouseId,
        productId: internalProductId,
        variantId: internalVariantId,
        type: 'TRANSFER_IN',
        quantityDelta: input.quantity,
        quantityAfter: destAfter.quantityOnHand,
        referenceType: 'TRANSFER',
        reason: input.reason ?? null,
        performedBy: this.context.userId,
        correlationId: this.context.correlationId ?? null,
      });
    });

    await this.cache.invalidate('inventory');
  }

  // =========================================================================
  // Checkout-facing reservation flow
  // =========================================================================

  /**
   * Reserves `quantity` for one line item, spread across warehouses in
   * priority order (docs/02 §8 + roadmap Phase 5 "multi-warehouse allocation
   * by priority"). All-or-nothing: if the combined available stock across
   * every candidate warehouse can't cover the request, every partial
   * reservation already taken in this call is rolled back before throwing.
   */
  async reserveAcrossWarehouses(
    manager: EntityManager,
    input: { storeId: string; productId: string; variantId: string | null; quantity: number; referenceType: string; referenceId: string },
  ): Promise<StockAllocation[]> {
    const levels = this.scopedTo(manager, this.levels);
    const movementsRepo = this.scopedTo(manager, this.movements);
    const candidates = await levels.warehouseCandidates(input.storeId);

    const allocations: StockAllocation[] = [];
    let remaining = input.quantity;

    for (const warehouse of candidates) {
      if (remaining <= 0) break;

      const slot = await levels.findSlot({
        warehouseId: warehouse.id,
        productId: input.productId,
        variantId: input.variantId,
      });
      if (!slot || slot.quantityAvailable <= 0) continue;

      const take = Math.min(remaining, slot.quantityAvailable);
      const reserved = await levels.reserveConditional(slot.id, take);
      if (!reserved) continue; // lost a race to another checkout; try the next warehouse

      const refreshed = await levels.findOneOrFail({ where: { id: slot.id } });
      await movementsRepo.record({
        warehouseId: warehouse.id,
        productId: input.productId,
        variantId: input.variantId,
        type: 'RESERVATION',
        quantityDelta: take,
        quantityAfter: refreshed.quantityReserved,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        correlationId: this.context.correlationId ?? null,
      });

      allocations.push({ warehouseId: warehouse.id, quantity: take, levelId: slot.id });
      remaining -= take;
    }

    if (remaining > 0) {
      // Roll back what this call itself reserved — a partial hold on one SKU
      // while another line in the same cart fails is worse than failing clean.
      for (const allocation of allocations) {
        await levels.releaseReserved(allocation.levelId, allocation.quantity);
      }
      throw new InventoryInsufficientError(
        input.productId,
        input.variantId,
        input.quantity,
        input.quantity - remaining,
      );
    }

    return allocations;
  }

  async releaseAllocations(
    manager: EntityManager,
    allocations: StockAllocation[],
    context: { productId: string; variantId: string | null; referenceType: string; referenceId: string },
  ): Promise<void> {
    const levels = this.scopedTo(manager, this.levels);
    const movementsRepo = this.scopedTo(manager, this.movements);

    for (const allocation of allocations) {
      await levels.releaseReserved(allocation.levelId, allocation.quantity);
      const refreshed = await levels.findOneOrFail({ where: { id: allocation.levelId } });
      await movementsRepo.record({
        warehouseId: allocation.warehouseId,
        productId: context.productId,
        variantId: context.variantId,
        type: 'RELEASE',
        quantityDelta: -allocation.quantity,
        quantityAfter: refreshed.quantityReserved,
        referenceType: context.referenceType,
        referenceId: context.referenceId,
        correlationId: this.context.correlationId ?? null,
      });
    }
  }

  /**
   * Releases a reservation identified by warehouse/product/variant rather
   * than by `levelId` — for callers (order cancellation) that only persisted
   * the warehouse a line was allocated to, not the inventory-level row id
   * itself. Resolves the slot, then delegates to `releaseAllocations`.
   */
  async releaseByProduct(
    manager: EntityManager,
    input: { warehouseId: string; productId: string; variantId: string | null; quantity: number; referenceType: string; referenceId: string },
  ): Promise<void> {
    const levels = this.scopedTo(manager, this.levels);
    const slot = await levels.findSlot(input);
    if (!slot) return; // nothing to release — the slot never existed, so nothing was ever reserved on it

    await this.releaseAllocations(
      manager,
      [{ warehouseId: input.warehouseId, quantity: input.quantity, levelId: slot.id }],
      { productId: input.productId, variantId: input.variantId, referenceType: input.referenceType, referenceId: input.referenceId },
    );
  }

  /** Converts held reservations into a committed sale — on-hand actually drops. */
  async commitAllocations(
    manager: EntityManager,
    allocations: StockAllocation[],
    context: { productId: string; variantId: string | null; referenceType: string; referenceId: string },
  ): Promise<void> {
    const levels = this.scopedTo(manager, this.levels);
    const movementsRepo = this.scopedTo(manager, this.movements);

    for (const allocation of allocations) {
      const committed = await levels.commitReserved(allocation.levelId, allocation.quantity);
      if (!committed) {
        throw new ConflictError('Reservation could not be committed — stock state changed unexpectedly');
      }
      const refreshed = await levels.findOneOrFail({ where: { id: allocation.levelId } });
      await movementsRepo.record({
        warehouseId: allocation.warehouseId,
        productId: context.productId,
        variantId: context.variantId,
        type: 'SALE',
        quantityDelta: -allocation.quantity,
        quantityAfter: refreshed.quantityOnHand,
        referenceType: context.referenceType,
        referenceId: context.referenceId,
        correlationId: this.context.correlationId ?? null,
      });
    }
  }

  /** `commitAllocations`, resolved by warehouse/product/variant instead of a stored `levelId` — see `releaseByProduct`. */
  async commitByProduct(
    manager: EntityManager,
    input: { warehouseId: string; productId: string; variantId: string | null; quantity: number; referenceType: string; referenceId: string },
  ): Promise<void> {
    const levels = this.scopedTo(manager, this.levels);
    const slot = await levels.findSlot(input);
    if (!slot) {
      throw new ConflictError('No reservation exists for this product at the recorded warehouse');
    }

    await this.commitAllocations(
      manager,
      [{ warehouseId: input.warehouseId, quantity: input.quantity, levelId: slot.id }],
      { productId: input.productId, variantId: input.variantId, referenceType: input.referenceType, referenceId: input.referenceId },
    );
  }

  /** Restocks committed sale quantity back onto the shelf — cancellations and returns. */
  async restock(
    manager: EntityManager,
    input: {
      warehouseId: string;
      productId: string;
      variantId: string | null;
      quantity: number;
      type: Extract<InventoryMovementType, 'RETURN' | 'ADJUSTMENT'>;
      referenceType: string;
      referenceId: string;
    },
  ): Promise<void> {
    const levels = this.scopedTo(manager, this.levels);
    const movementsRepo = this.scopedTo(manager, this.movements);

    const slot = await levels.ensureSlot(input);
    await levels.adjustOnHand(slot.id, input.quantity);
    const refreshed = await levels.findOneOrFail({ where: { id: slot.id } });

    await movementsRepo.record({
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId,
      type: input.type,
      quantityDelta: input.quantity,
      quantityAfter: refreshed.quantityOnHand,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      correlationId: this.context.correlationId ?? null,
    });
  }

  // =========================================================================
  // Reads
  // =========================================================================

  async listMovements(productId: string, page: number, limit: number): Promise<{
    items: InventoryMovementResponse[];
    total: number;
  }> {
    const internalProductId = await this.resolveProductId(productId);
    const { items, total } = await this.movements.listByProduct(internalProductId, page, limit);
    const warehousePublicIds = await this.warehousePublicIds(items.map((m) => m.warehouseId));
    const variantPublicIds = await this.variantPublicIds(items.map((m) => m.variantId));
    return {
      items: items.map((m) => ({
        id: m.id,
        warehouseId: warehousePublicIds.get(m.warehouseId) ?? m.warehouseId,
        productId,
        variantId: m.variantId ? (variantPublicIds.get(m.variantId) ?? m.variantId) : null,
        type: m.type,
        quantityDelta: m.quantityDelta,
        quantityAfter: m.quantityAfter,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        reason: m.reason,
        createdAt: m.createdAt.toISOString(),
      })),
      total,
    };
  }

  async listLowStock(limit = 100): Promise<InventoryLevelResponse[]> {
    const rows = await this.levels.listLowStock(limit);
    const names = await this.warehouseNames(rows.map((r) => r.warehouseId));
    const warehousePublicIds = await this.warehousePublicIds(rows.map((r) => r.warehouseId));
    const productPublicIds = await this.productPublicIds(rows.map((r) => r.productId));
    const variantPublicIds = await this.variantPublicIds(rows.map((r) => r.variantId));
    return rows.map((row) =>
      this.toResponse(row, {
        warehouseId: warehousePublicIds.get(row.warehouseId) ?? row.warehouseId,
        warehouseName: names.get(row.warehouseId) ?? row.warehouseId,
        productId: productPublicIds.get(row.productId) ?? row.productId,
        variantId: row.variantId ? (variantPublicIds.get(row.variantId) ?? row.variantId) : null,
      }),
    );
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private scopedTo(manager: EntityManager, repo: InventoryLevelRepository): InventoryLevelRepository;
  private scopedTo(manager: EntityManager, repo: InventoryMovementRepository): InventoryMovementRepository;
  private scopedTo(
    manager: EntityManager,
    repo: InventoryLevelRepository | InventoryMovementRepository,
  ): InventoryLevelRepository | InventoryMovementRepository {
    return repo.withManager(manager);
  }

  private async warehouseName(warehouseId: string): Promise<string> {
    return (await this.warehouseNames([warehouseId])).get(warehouseId) ?? warehouseId;
  }

  private async warehouseNames(warehouseIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(warehouseIds)];
    if (unique.length === 0) return new Map();
    const tenantId = this.context.requireTenantId('inventory warehouse lookup');
    const rows = (await this.manager.query(
      `SELECT id, name FROM warehouses WHERE tenant_id = ? AND id IN (${unique.map(() => '?').join(',')})`,
      [tenantId, ...unique],
    )) as { id: string; name: string }[];
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async warehousePublicIds(internalIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(internalIds)];
    if (unique.length === 0) return new Map();
    const tenantId = this.context.requireTenantId('inventory warehouse lookup');
    const rows = (await this.manager.query(
      `SELECT id, public_id AS publicId FROM warehouses WHERE tenant_id = ? AND id IN (${unique.map(() => '?').join(',')})`,
      [tenantId, ...unique],
    )) as { id: string; publicId: string }[];
    return new Map(rows.map((r) => [r.id, r.publicId]));
  }

  private async productPublicIds(internalIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(internalIds)];
    if (unique.length === 0) return new Map();
    const tenantId = this.context.requireTenantId('inventory product lookup');
    const rows = (await this.manager.query(
      `SELECT id, public_id AS publicId FROM products WHERE tenant_id = ? AND id IN (${unique.map(() => '?').join(',')})`,
      [tenantId, ...unique],
    )) as { id: string; publicId: string }[];
    return new Map(rows.map((r) => [r.id, r.publicId]));
  }

  private async variantPublicIds(internalIds: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(internalIds.filter((v): v is string => v !== null))];
    if (unique.length === 0) return new Map();
    const tenantId = this.context.requireTenantId('inventory variant lookup');
    const rows = (await this.manager.query(
      `SELECT id, public_id AS publicId FROM product_variants WHERE tenant_id = ? AND id IN (${unique.map(() => '?').join(',')})`,
      [tenantId, ...unique],
    )) as { id: string; publicId: string }[];
    return new Map(rows.map((r) => [r.id, r.publicId]));
  }

  private toResponse(level: InventoryLevelEntity, ids: ResponseIds): InventoryLevelResponse {
    return {
      warehouseId: ids.warehouseId,
      warehouseName: ids.warehouseName,
      productId: ids.productId,
      variantId: ids.variantId,
      quantityOnHand: level.quantityOnHand,
      quantityReserved: level.quantityReserved,
      quantityIncoming: level.quantityIncoming,
      quantityAvailable: level.quantityAvailable,
      reorderPoint: level.reorderPoint,
      reorderQuantity: level.reorderQuantity,
      binLocation: level.binLocation,
      lastCountedAt: level.lastCountedAt?.toISOString() ?? null,
      updatedAt: level.updatedAt.toISOString(),
    };
  }
}
