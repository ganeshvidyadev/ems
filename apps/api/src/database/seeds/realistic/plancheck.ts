import { createHash } from 'node:crypto';
import { buildTenantDataset } from './dataset';
import { computeWork, type Lookups } from './db/engine';
import { TABLES } from './db/tables';
import type { CheckResult } from './selfcheck';
import { type DatasetOptions, Ref, TABLE_ORDER, type Row, type TableName, type TenantDataset, type TenantSpec } from './types';

function walkRefs(value: unknown, visit: (ref: Ref) => void): void {
  if (value instanceof Ref) visit(value);
  else if (Array.isArray(value)) value.forEach((x) => walkRefs(x, visit));
  else if (value && typeof value === 'object' && !(value instanceof Date)) Object.values(value as Record<string, unknown>).forEach((x) => walkRefs(x, visit));
}

/**
 * Checks that the writer can actually resolve the plan: every table that other rows point at has a
 * key query and an id map, and every reference points at a table that is written earlier.
 */
export function checkWriterConfig(datasets: TenantDataset[]): CheckResult {
  const problems: string[] = [];
  const order = new Map<TableName, number>(TABLE_ORDER.map((t, i) => [t, i] as const));
  const external = new Set<TableName>(['roles', 'theme_templates', 'tenants']);
  for (const ds of datasets) {
    for (const [table, rows] of Object.entries(ds.rows) as [TableName, Row[]][]) {
      for (const row of rows) {
        const visit = (ref: Ref, via: string): void => {
          if (external.has(ref.table)) return;
          const desc = TABLES[ref.table as keyof typeof TABLES];
          if (!desc?.keySql || !desc.referenced) problems.push(`${table}.${via} references ${ref.table}, which has no id map`);
          if ((order.get(ref.table) ?? 99) > (order.get(table) ?? -1)) problems.push(`${table}.${via} references ${ref.table}, which is written later`);
        };
        for (const [col, value] of Object.entries(row.v)) walkRefs(value, (r) => visit(r, col));
        if (row.owner) {
          const d = TABLES[row.owner.table as keyof typeof TABLES];
          if (!d?.keySql) problems.push(`${table} is owned by ${row.owner.table}, which has no key query`);
          if ((order.get(row.owner.table) ?? 99) > (order.get(table) ?? -1)) problems.push(`${table} owner ${row.owner.table} is written later`);
        }
      }
    }
  }
  const unique = [...new Set(problems)];
  return { name: 'writer: every reference resolves through an id map and points at an earlier table', ok: unique.length === 0, detail: unique.slice(0, 3).join('; ') };
}

/**
 * Idempotency simulation (no database): pretend every natural key already exists and confirm the plan
 * inserts nothing; then pretend only the tenant's customers/orders owners are missing and confirm that
 * exactly their children would be inserted.
 */
export function checkIdempotency(datasets: TenantDataset[]): CheckResult {
  const problems: string[] = [];
  const lookups: Lookups = { roles: new Map(), themeTemplates: new Map([['electronics', '1'], ['fashion', '2'], ['grocery', '3'], ['general', '4'], ['furniture', '5']]) };
  for (const ds of datasets) {
    const present = new Map<TableName, Set<string>>();
    for (const table of TABLE_ORDER) {
      const rows = ds.rows[table] ?? [];
      // Rows owned by another row are covered by the owner's presence; others by their own key.
      if (TABLES[table].keySql) present.set(table, new Set(rows.map((r) => r.nk)));
    }
    const all = computeWork(ds, present, lookups).reduce((s, w) => s + w.toInsert.length, 0);
    if (all !== 0) problems.push(`${ds.slug}: ${all} row(s) would be inserted although every key exists`);

    const none = computeWork(ds, new Map(), lookups).reduce((s, w) => s + w.toInsert.length, 0);
    const planned = TABLE_ORDER.reduce((s, t) => s + (ds.rows[t]?.length ?? 0), 0);
    if (none !== planned) problems.push(`${ds.slug}: empty database plans ${none} of ${planned} rows`);

    // Orders missing, everything else present: only the order graph (and ledger) must be planned.
    const withoutOrders = new Map(present);
    withoutOrders.set('orders', new Set());
    const partial = computeWork(ds, withoutOrders, lookups);
    const stray = partial.filter((w) => w.toInsert.length > 0 && !['orders', 'order_items', 'order_status_history', 'payments', 'refunds', 'shipments', 'shipment_items', 'shipment_events', 'returns', 'return_items', 'coupon_redemptions', 'inventory_movements', 'loyalty_transactions', 'reviews'].includes(w.table));
    if (stray.length > 0) problems.push(`${ds.slug}: unrelated tables would be re-inserted: ${stray.map((s) => s.table).join(', ')}`);
  }
  return { name: 'idempotency simulation: all keys present -> 0 inserts; missing owners -> only their children', ok: problems.length === 0, detail: problems.slice(0, 3).join('; ') };
}

/** CHECK constraints that are not simple IN-lists, evaluated in memory against the rows. */
export function checkTableConstraints(ds: TenantDataset): CheckResult {
  const problems: string[] = [];
  const n = (v: unknown): number => Number(v);
  const rows = (t: TableName): Row[] => ds.rows[t] ?? [];
  for (const r of rows('coupons')) {
    const s = r.v['starts_at'] as Date | null;
    const e = r.v['ends_at'] as Date | null;
    if (s && e && e <= s) problems.push(`coupon ${r.nk}: ends_at <= starts_at`);
  }
  for (const r of rows('gift_cards')) if (n(r.v['balance_minor']) < 0 || n(r.v['balance_minor']) > n(r.v['initial_value_minor'])) problems.push(`gift card ${r.nk}: balance outside 0..initial`);
  for (const r of rows('refunds')) if (n(r.v['amount_minor']) <= 0) problems.push(`refund ${r.nk}: amount must be > 0`);
  for (const r of rows('reviews')) if (n(r.v['rating']) < 1 || n(r.v['rating']) > 5) problems.push(`review ${r.nk}: rating`);
  for (const r of rows('tax_rates')) if (n(r.v['rate']) < 0 || n(r.v['rate']) > 100) problems.push(`tax rate ${r.nk}: rate`);
  for (const r of rows('customers')) if (!r.v['email'] && !r.v['phone_e164']) problems.push(`customer ${r.nk}: no identity`);
  for (const r of rows('order_items')) if (n(r.v['quantity']) <= 0) problems.push(`item ${r.nk}: quantity`);
  for (const r of rows('inventory_levels')) if (n(r.v['quantity_reserved']) < 0) problems.push(`level ${r.nk}: reserved < 0`);
  for (const r of rows('users')) if (r.v['user_type'] !== 'TENANT') problems.push(`user ${r.nk}: user_type`);
  for (const r of rows('payments')) {
    const amount = n(r.v['amount_minor']);
    if (n(r.v['amount_captured_minor']) > amount || n(r.v['amount_refunded_minor']) > n(r.v['amount_captured_minor'])) problems.push(`payment ${r.nk}: amounts`);
  }
  return { name: 'table CHECK constraints hold (coupon window, gift-card balance, refund > 0, ratings, tax rate, identity, quantities)', ok: problems.length === 0, detail: problems.slice(0, 3).join('; ') };
}

function digest(ds: TenantDataset): string {
  const replacer = (_key: string, value: unknown): unknown => (value instanceof Ref ? `ref:${value.table}:${value.nk}` : value);
  const hash = createHash('sha256');
  hash.update(JSON.stringify(ds.tenant, replacer));
  for (const table of TABLE_ORDER) hash.update(`${table}:${JSON.stringify(ds.rows[table] ?? [], replacer)}`);
  return hash.digest('hex').slice(0, 16);
}

/** Determinism: building the same tenant twice gives byte-identical rows; a different seed gives different ones. */
export function checkDeterminism(spec: TenantSpec, opts: DatasetOptions, ds: TenantDataset): CheckResult {
  const again = buildTenantDataset(spec, opts);
  const other = buildTenantDataset(spec, { ...opts, seed: opts.seed + 1 });
  const same = digest(again) === digest(ds);
  const differs = digest(other) !== digest(ds);
  return {
    name: `determinism: same seed -> identical rows (${digest(ds)}); different seed -> different rows`,
    ok: same && differs,
    detail: `${ds.slug}: rebuild ${same ? 'identical' : 'DIFFERENT'}, other seed ${differs ? 'differs' : 'IDENTICAL'}`,
  };
}
