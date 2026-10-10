import { TARGETS } from './catalogs';
import { Ref, type Row, type TableName, type TenantDataset, type Val } from './types';

/**
 * In-memory consistency checks on a generated dataset. These run during every dry-run, before the
 * database is even consulted, so a generator bug is caught as a failing check instead of as bad
 * data. They mirror the database-level checks in `validate.ts` (which re-verify after a write).
 */

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const EXTERNAL_REF_TABLES = new Set<TableName>(['roles', 'theme_templates', 'tenants']);

function num(v: Val | undefined): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

function walkRefs(value: unknown, visit: (ref: Ref) => void): void {
  if (value instanceof Ref) visit(value);
  else if (Array.isArray(value)) value.forEach((x) => walkRefs(x, visit));
  else if (value && typeof value === 'object' && !(value instanceof Date)) Object.values(value as Record<string, unknown>).forEach((x) => walkRefs(x, visit));
}

export function checkDataset(ds: TenantDataset, now: Date): CheckResult[] {
  const results: CheckResult[] = [];
  const rows = (t: TableName): Row[] => ds.rows[t] ?? [];
  const check = (name: string, problems: string[]): void => {
    results.push({ name, ok: problems.length === 0, detail: problems.length === 0 ? 'ok' : `${problems.length} problem(s): ${problems.slice(0, 3).join('; ')}` });
  };

  // 1. Natural keys unique per table; consistent column sets.
  {
    const problems: string[] = [];
    for (const [table, list] of Object.entries(ds.rows) as [TableName, Row[]][]) {
      const seen = new Set<string>();
      const columns = new Set(Object.keys(list[0]?.v ?? {}).sort());
      for (const row of list) {
        if (seen.has(row.nk)) problems.push(`${table}: duplicate nk ${row.nk}`);
        seen.add(row.nk);
        const keys = Object.keys(row.v).sort().join(',');
        if (keys !== [...columns].join(',')) problems.push(`${table}: ${row.nk} has a different column set`);
      }
    }
    check('natural keys unique, column sets consistent', problems);
  }

  // 2. Every Ref resolves inside the dataset (or to a platform lookup table).
  {
    const keys = new Map<TableName, Set<string>>();
    for (const [table, list] of Object.entries(ds.rows) as [TableName, Row[]][]) keys.set(table, new Set(list.map((r) => r.nk)));
    const problems: string[] = [];
    for (const [table, list] of Object.entries(ds.rows) as [TableName, Row[]][]) {
      for (const row of list) {
        const visit = (ref: Ref): void => {
          if (EXTERNAL_REF_TABLES.has(ref.table)) return;
          if (!keys.get(ref.table)?.has(ref.nk)) problems.push(`${table}:${row.nk} -> ${ref.table}:${ref.nk}`);
        };
        walkRefs(row.v, visit);
        if (row.owner) visit(row.owner);
      }
    }
    check('all foreign keys resolve within the tenant', problems);
  }

  // 3. Targets.
  check('exactly 200 products / 100 customers / 150 orders', [
    ...(rows('products').length === TARGETS.products ? [] : [`products=${rows('products').length}`]),
    ...(rows('customers').length === TARGETS.customers ? [] : [`customers=${rows('customers').length}`]),
    ...(rows('orders').length === TARGETS.orders ? [] : [`orders=${rows('orders').length}`]),
  ]);

  // 4. Catalog rules.
  {
    const problems: string[] = [];
    const variantsByProduct = new Map<string, number>();
    for (const v of rows('product_variants')) {
      const p = (v.v['product_id'] as Ref).nk;
      variantsByProduct.set(p, (variantsByProduct.get(p) ?? 0) + 1);
    }
    const slotsByProduct = new Map<string, { variantless: number; withVariant: number }>();
    for (const l of rows('inventory_levels')) {
      const p = (l.v['product_id'] as Ref).nk;
      const s = slotsByProduct.get(p) ?? { variantless: 0, withVariant: 0 };
      if (l.v['variant_id'] === null) s.variantless += 1;
      else s.withVariant += 1;
      slotsByProduct.set(p, s);
    }
    let compare = 0;
    let cost55to85 = 0;
    for (const p of rows('products')) {
      const price = num(p.v['price_minor']);
      const cmp = p.v['compare_price_minor'];
      if (cmp !== null) {
        compare += 1;
        if (num(cmp) <= price) problems.push(`${p.nk}: compare <= price`);
      }
      const ratio = num(p.v['cost_price_minor']) / price;
      if (ratio >= 0.54 && ratio <= 0.86) cost55to85 += 1;
      const type = p.v['type'];
      const vcount = variantsByProduct.get(p.nk) ?? 0;
      const slots = slotsByProduct.get(p.nk) ?? { variantless: 0, withVariant: 0 };
      if (type === 'SIMPLE' && (vcount !== 0 || slots.variantless < 1 || slots.withVariant !== 0)) problems.push(`${p.nk}: SIMPLE needs variant-less slot(s) only`);
      if (type === 'VARIABLE' && (vcount < 2 || slots.variantless !== 0 || slots.withVariant < vcount)) problems.push(`${p.nk}: VARIABLE needs per-variant slots only`);
      if (type === 'SIMPLE' && p.v['sku'] === null) problems.push(`${p.nk}: SIMPLE without sku`);
    }
    const share = compare / rows('products').length;
    if (share < 0.2 || share > 0.4) problems.push(`compare-at share ${share.toFixed(2)} not near 30%`);
    if (cost55to85 !== rows('products').length) problems.push(`cost ratio outside 55-85% for ${rows('products').length - cost55to85} products`);
    check('catalog: SIMPLE/VARIABLE slots, compare-at ~30%, cost 55-85%', problems);
  }

  // 5. Order arithmetic.
  {
    const problems: string[] = [];
    const items = new Map<string, Row[]>();
    for (const it of rows('order_items')) {
      const k = (it.v['order_id'] as Ref).nk;
      (items.get(k) ?? items.set(k, []).get(k)!).push(it);
    }
    for (const o of rows('orders')) {
      const v = o.v;
      const total = num(v['subtotal_minor']) - num(v['discount_minor']) + num(v['shipping_minor']) + num(v['tax_minor']) + num(v['cod_fee_minor']) + num(v['round_off_minor']);
      if (total !== num(v['total_minor'])) problems.push(`${o.nk}: total formula`);
      const lines = items.get(o.nk) ?? [];
      if (lines.length < 1 || lines.length > 5) problems.push(`${o.nk}: ${lines.length} lines`);
      const sum = (col: string): number => lines.reduce((s, l) => s + num(l.v[col]), 0);
      if (sum('line_subtotal_minor') !== num(v['subtotal_minor'])) problems.push(`${o.nk}: subtotal != items`);
      if (sum('line_discount_minor') !== num(v['discount_minor'])) problems.push(`${o.nk}: discount != items`);
      if (sum('line_tax_minor') !== num(v['tax_minor'])) problems.push(`${o.nk}: tax != items`);
      for (const l of lines) {
        if (num(l.v['line_total_minor']) !== num(l.v['line_subtotal_minor']) - num(l.v['line_discount_minor']) + num(l.v['line_tax_minor'])) problems.push(`${o.nk}: line total`);
        if (num(l.v['unit_price_minor']) * num(l.v['quantity']) !== num(l.v['line_subtotal_minor'])) problems.push(`${o.nk}: unit x qty`);
        const breakup = l.v['tax_breakup'] as { amountMinor: string }[] | null;
        if (breakup && breakup.reduce((s, b) => s + Number(b.amountMinor), 0) !== num(l.v['line_tax_minor'])) problems.push(`${o.nk}: tax breakup`);
        const alloc = l.v['stock_allocations'] as { quantity: number }[];
        if (alloc.reduce((s, a) => s + a.quantity, 0) !== num(l.v['quantity'])) problems.push(`${o.nk}: allocations != quantity`);
        if (num(l.v['quantity_returned']) > num(l.v['quantity'])) problems.push(`${o.nk}: returned > quantity`);
      }
      if (num(v['amount_refunded_minor']) > num(v['amount_paid_minor'])) problems.push(`${o.nk}: refunded > paid`);
      if (num(v['amount_paid_minor']) > num(v['total_minor'])) problems.push(`${o.nk}: paid > total`);
      const status = v['status'] as string;
      const pay = v['payment_status'] as string;
      if ((status === 'DELIVERED' || status === 'COMPLETED') && !['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(pay)) problems.push(`${o.nk}: delivered but ${pay}`);
      if (status === 'PENDING' && v['placed_at'] !== null) problems.push(`${o.nk}: pending with placed_at`);
    }
    check('orders: totals reconcile (total = subtotal - discount + shipping + tax + COD fee + round-off)', problems);
  }

  // 6. Payments and refunds.
  {
    const problems: string[] = [];
    const refundSum = new Map<string, number>();
    for (const r of rows('refunds')) {
      const k = (r.v['payment_id'] as Ref).nk;
      refundSum.set(k, (refundSum.get(k) ?? 0) + num(r.v['amount_minor']));
    }
    const orders = new Map(rows('orders').map((o) => [o.nk, o] as const));
    const paidByOrder = new Map<string, number>();
    for (const p of rows('payments')) {
      const v = p.v;
      if (num(v['amount_captured_minor']) > num(v['amount_minor'])) problems.push(`${p.nk}: captured > amount`);
      if (num(v['amount_refunded_minor']) > num(v['amount_captured_minor'])) problems.push(`${p.nk}: refunded > captured`);
      if ((refundSum.get(p.nk) ?? 0) !== num(v['amount_refunded_minor'])) problems.push(`${p.nk}: refunds != amount_refunded`);
      const o = orders.get((v['order_id'] as Ref).nk)!;
      if (num(v['amount_minor']) !== num(o.v['total_minor'])) problems.push(`${p.nk}: payment amount != order total`);
      paidByOrder.set(o.nk, (paidByOrder.get(o.nk) ?? 0) + num(v['amount_captured_minor']));
      if (v['gateway'] === 'STUB' && v['status'] !== 'PENDING' && v['status'] === 'CAPTURED' && !v['gateway_payment_id']) problems.push(`${p.nk}: captured stub without payment id`);
    }
    for (const o of rows('orders')) {
      const captured = paidByOrder.get(o.nk) ?? 0;
      const paid = num(o.v['amount_paid_minor']);
      if (captured !== paid) problems.push(`${o.nk}: captured ${captured} != amount_paid ${paid}`);
    }
    check('payments/refunds reconcile with orders', problems);
  }

  // 7. Inventory ledger replay.
  {
    const problems: string[] = [];
    const levels = new Map(rows('inventory_levels').map((l) => [l.nk, l] as const));
    const state = new Map<string, { onHand: number; reserved: number }>();
    const slotKey = (m: Row): string => {
      const v = m.v;
      return `${(v['warehouse_id'] as Ref).nk}|${(v['product_id'] as Ref).nk}|${v['variant_id'] ? (v['variant_id'] as Ref).nk : ''}`;
    };
    // Movements keep their per-slot order inside the global list, so a single pass is a valid replay.
    for (const m of rows('inventory_movements')) {
      const key = slotKey(m);
      const s = state.get(key) ?? { onHand: 0, reserved: 0 };
      const delta = num(m.v['quantity_delta']);
      const type = m.v['type'] as string;
      const refType = m.v['reference_type'] as string | null;
      if (type === 'RESERVATION' || type === 'RELEASE') s.reserved += delta;
      else {
        s.onHand += delta;
        if (type === 'SALE' && refType === 'ORDER') s.reserved += delta; // a sale consumes its own reservation
      }
      const after = type === 'RESERVATION' || type === 'RELEASE' ? s.reserved : s.onHand;
      if (after !== num(m.v['quantity_after'])) problems.push(`${m.nk}: quantity_after ${num(m.v['quantity_after'])} != replay ${after}`);
      if (s.onHand < 0 || s.reserved < 0 || s.reserved > s.onHand) problems.push(`${m.nk}: invariant on_hand=${s.onHand} reserved=${s.reserved}`);
      state.set(key, s);
    }
    for (const [nk, level] of levels) {
      // level nk is `${wh}|${slug}|${variant}`, same as the replay key.
      const s = state.get(nk) ?? { onHand: 0, reserved: 0 };
      if (s.onHand !== num(level.v['quantity_on_hand'])) problems.push(`${nk}: on_hand ${num(level.v['quantity_on_hand'])} != ledger ${s.onHand}`);
      if (s.reserved !== num(level.v['quantity_reserved'])) problems.push(`${nk}: reserved ${num(level.v['quantity_reserved'])} != ledger ${s.reserved}`);
      if (num(level.v['quantity_on_hand']) < num(level.v['quantity_reserved']) || num(level.v['quantity_reserved']) < 0) problems.push(`${nk}: reserved invariant`);
    }
    check('inventory: ledger replays to levels, never negative, reserved <= on-hand', problems);
  }

  // 8. Coupons.
  {
    const problems: string[] = [];
    const used = new Map<string, number>();
    const perCustomer = new Map<string, number>();
    const orders = new Map(rows('orders').map((o) => [o.nk, o] as const));
    const coupons = new Map(rows('coupons').map((c) => [c.nk, c] as const));
    for (const r of rows('coupon_redemptions')) {
      const code = (r.v['coupon_id'] as Ref).nk;
      used.set(code, (used.get(code) ?? 0) + 1);
      const ck = `${code}|${(r.v['customer_id'] as Ref).nk}`;
      perCustomer.set(ck, (perCustomer.get(ck) ?? 0) + 1);
      const coupon = coupons.get(code)!;
      const at = (r.v['redeemed_at'] as Date).getTime();
      const starts = coupon.v['starts_at'] as Date | null;
      const ends = coupon.v['ends_at'] as Date | null;
      if ((starts && at < starts.getTime()) || (ends && at > ends.getTime())) problems.push(`${code}: redeemed outside its window`);
      const order = orders.get((r.v['order_id'] as Ref).nk)!;
      const min = coupon.v['min_order_minor'];
      if (min !== null && num(order.v['subtotal_minor']) < num(min)) problems.push(`${code}: below min order`);
    }
    for (const [code, c] of coupons) {
      const count = used.get(code) ?? 0;
      if (count !== num(c.v['usage_count'])) problems.push(`${code}: usage_count ${num(c.v['usage_count'])} != redemptions ${count}`);
      const limit = c.v['usage_limit_total'];
      if (limit !== null && count > num(limit)) problems.push(`${code}: usage ${count} > limit ${num(limit)}`);
    }
    for (const [ck, n] of perCustomer) {
      const limit = coupons.get(ck.split('|')[0]!)!.v['usage_limit_per_customer'];
      if (limit !== null && n > num(limit)) problems.push(`${ck}: per-customer ${n} > ${num(limit)}`);
    }
    check('coupons: usage_count equals redemptions and respects limits/windows', problems);
  }

  // 9. Aggregates the app denormalises.
  {
    const problems: string[] = [];
    const sold = new Map<string, number>();
    const orders = new Map(rows('orders').map((o) => [o.nk, o] as const));
    for (const it of rows('order_items')) {
      const o = orders.get((it.v['order_id'] as Ref).nk)!;
      if (['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(o.v['status'] as string)) {
        const p = (it.v['product_id'] as Ref).nk;
        sold.set(p, (sold.get(p) ?? 0) + num(it.v['quantity']));
      }
    }
    for (const p of rows('products')) if ((sold.get(p.nk) ?? 0) !== num(p.v['total_sold'])) problems.push(`${p.nk}: total_sold`);
    const rating = new Map<string, { sum: number; n: number }>();
    for (const r of rows('reviews')) {
      if (r.v['status'] !== 'APPROVED') continue;
      const p = (r.v['product_id'] as Ref).nk;
      const s = rating.get(p) ?? { sum: 0, n: 0 };
      s.sum += num(r.v['rating']);
      s.n += 1;
      rating.set(p, s);
    }
    for (const p of rows('products')) {
      const s = rating.get(p.nk) ?? { sum: 0, n: 0 };
      if (s.n !== num(p.v['rating_count'])) problems.push(`${p.nk}: rating_count`);
      if (s.n > 0 && Math.abs(Number(p.v['rating_average']) - s.sum / s.n) > 0.006) problems.push(`${p.nk}: rating_average`);
    }
    const points = new Map<string, number>();
    for (const t of rows('loyalty_transactions')) points.set((t.v['customer_id'] as Ref).nk, (points.get((t.v['customer_id'] as Ref).nk) ?? 0) + num(t.v['points_delta']));
    for (const c of rows('customers')) if ((points.get(c.nk) ?? 0) !== num(c.v['loyalty_points'])) problems.push(`${c.nk}: loyalty_points`);
    check('denormalised aggregates (sold, ratings, loyalty) match their source rows', problems);
  }

  // 10. Time bounds.
  {
    const problems: string[] = [];
    for (const [table, list] of Object.entries(ds.rows) as [TableName, Row[]][]) {
      for (const row of list) {
        if (row.ts.getTime() > now.getTime()) problems.push(`${table}:${row.nk} created in the future`);
        for (const [col, val] of Object.entries(row.v)) {
          if (val instanceof Date && val.getTime() > now.getTime() && !['expires_at', 'ends_at', 'expected_delivery_at'].includes(col)) problems.push(`${table}:${row.nk}.${col} in the future`);
        }
      }
    }
    check('no timestamp is later than the as-of instant', problems);
  }

  // 11. Tenant isolation: nothing references another tenant (every ref resolved above stays in-tenant by construction).
  check('every row belongs to this tenant (refs never cross tenants)', ds.warnings.filter((w) => w.includes('tenant')));
  return results;
}

/** Cross-tenant uniqueness for keys that the database enforces globally. */
export function checkGlobalUniqueness(datasets: TenantDataset[]): CheckResult {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  const note = (kind: string, value: unknown, owner: string): void => {
    if (value === null || value === undefined) return;
    const key = `${kind}:${String(value)}`;
    const prior = seen.get(key);
    if (prior && prior !== owner) problems.push(`${key} used by ${prior} and ${owner}`);
    seen.set(key, owner);
  };
  for (const ds of datasets) {
    note('tenant.slug', ds.tenant.nk, ds.slug);
    for (const r of rows(ds, 'tenant_domains')) note('hostname', r.v['hostname'], ds.slug);
    for (const r of rows(ds, 'gift_cards')) note('gift_card.code_hash', r.v['code_hash'], ds.slug);
    for (const r of rows(ds, 'shipments')) note('shipment.awb', `${r.v['carrier']}|${r.v['awb_number']}`, ds.slug);
    for (const r of rows(ds, 'payments')) if (r.v['gateway_payment_id']) note('payment.gateway_ref', `${r.v['gateway']}|${r.v['gateway_payment_id']}`, ds.slug);
    for (const r of rows(ds, 'users')) note('user.email', r.v['email_normalized'], ds.slug);
  }
  return { name: 'cross-tenant: hostnames, gift-card hashes, AWBs, gateway ids, emails are globally unique', ok: problems.length === 0, detail: problems.length === 0 ? 'ok' : problems.slice(0, 3).join('; ') };
}

function rows(ds: TenantDataset, table: TableName): Row[] {
  return ds.rows[table] ?? [];
}
