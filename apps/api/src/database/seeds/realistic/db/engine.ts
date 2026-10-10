import * as bcrypt from 'bcrypt';
import { deterministicPublicId } from '../rng';
import { CUSTOMER_PASSWORD_PLACEHOLDER, STAFF_PASSWORD_PLACEHOLDER } from '../generators/context';
import { Ref, TABLE_ORDER, type Row, type TableName, type TenantDataset, type Val } from '../types';
import { type Conn, q } from './connection';
import { ROLE_KEY_SQL, TABLES, THEME_TEMPLATE_KEY_SQL } from './tables';

type SeededTable = (typeof TABLE_ORDER)[number];

// ---------------------------------------------------------------------------
// Read side (safe on a READ ONLY session)
// ---------------------------------------------------------------------------

export async function loadKeys(conn: Conn, sql: string, params: unknown[] = []): Promise<Map<string, string>> {
  const rows = await q<{ nk: string; id: string | number }>(conn, sql, params);
  return new Map(rows.map((r) => [String(r.nk), String(r.id)] as const));
}

export interface TenantLookup {
  id: string;
}

export async function findTenant(conn: Conn, slug: string): Promise<TenantLookup | null> {
  const rows = await q<{ id: string }>(conn, 'SELECT id FROM tenants WHERE slug = ?', [slug]);
  return rows[0] ? { id: String(rows[0].id) } : null;
}

export interface Lookups {
  roles: Map<string, string>;
  themeTemplates: Map<string, string>;
}

export async function loadLookups(conn: Conn): Promise<Lookups> {
  return { roles: await loadKeys(conn, ROLE_KEY_SQL), themeTemplates: await loadKeys(conn, THEME_TEMPLATE_KEY_SQL) };
}

/** Natural keys already present for the tenant, per table that has a key query. */
export async function loadPreExisting(conn: Conn, tenantId: string): Promise<Map<TableName, Set<string>>> {
  const out = new Map<TableName, Set<string>>();
  for (const table of TABLE_ORDER) {
    const desc = TABLES[table];
    if (!desc.keySql) continue;
    const keys = await loadKeys(conn, desc.keySql, [tenantId]);
    out.set(table, new Set(keys.keys()));
  }
  return out;
}

export interface TableWork {
  table: SeededTable;
  planned: number;
  existing: number;
  toInsert: Row[];
  /** Rows skipped because an optional reference (e.g. a theme template) does not exist. */
  skippedOptional: number;
}

/** Which rows of one table still need inserting, given what already exists. Pure. */
export function computeWork(ds: TenantDataset, preExisting: Map<TableName, Set<string>>, lookups: Lookups | null): TableWork[] {
  return TABLE_ORDER.map((table) => {
    const rows = ds.rows[table] ?? [];
    const toInsert: Row[] = [];
    let skippedOptional = 0;
    for (const row of rows) {
      const present = row.owner ? (preExisting.get(row.owner.table)?.has(row.owner.nk) ?? false) : (preExisting.get(table)?.has(row.nk) ?? false);
      if (present) continue;
      if (row.optional && lookups) {
        let missing = false;
        for (const value of Object.values(row.v)) if (value instanceof Ref && value.table === 'theme_templates' && !lookups.themeTemplates.has(value.nk)) missing = true;
        if (missing) {
          skippedOptional += 1;
          continue;
        }
      }
      toInsert.push(row);
    }
    return { table, planned: rows.length, existing: rows.length - toInsert.length - skippedOptional, toInsert, skippedOptional };
  });
}

// ---------------------------------------------------------------------------
// Write side
// ---------------------------------------------------------------------------

/** The only object that can authorise a write: constructed from the explicit `--approve-writes` flag. */
export class WriteGate {
  constructor(readonly approved: boolean) {}
  assert(): void {
    if (!this.approved) throw new Error('Write refused: --approve-writes was not given.');
  }
}

const ALLOWED_WRITES: RegExp[] = [
  /^INSERT INTO `[a-z_]+` \(/,
  /^UPDATE categories SET path = CONCAT\('\/', id, '\/'\) WHERE tenant_id = \? AND parent_id IS NULL AND path = '\/pending\/'$/,
  /^UPDATE categories c JOIN categories p ON p\.id = c\.parent_id SET c\.path = CONCAT\(p\.path, c\.id, '\/'\) WHERE c\.tenant_id = \? AND c\.path = '\/pending\/'$/,
  /^UPDATE tenants SET owner_user_id = \? WHERE id = \? AND owner_user_id IS NULL$/,
];

async function exec(conn: Conn, gate: WriteGate, sql: string, params: unknown[]): Promise<number> {
  gate.assert();
  if (!ALLOWED_WRITES.some((re) => re.test(sql))) throw new Error(`Refusing non-additive statement: ${sql.slice(0, 80)}`);
  const [result] = await conn.query(sql, params);
  return (result as { affectedRows: number }).affectedRows;
}

export interface Passwords {
  staffHash: string;
  customerHash: string;
}

export async function makePasswordHashes(): Promise<Passwords> {
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  // The shared local demo passwords documented in PROJECT_RUN_GUIDE.md; overridable, never printed.
  const staff = process.env.SEED_STAFF_PASSWORD ?? 'DemoPassword123!';
  const customer = process.env.SEED_CUSTOMER_PASSWORD ?? 'Password123!';
  return { staffHash: await bcrypt.hash(staff, rounds), customerHash: await bcrypt.hash(customer, rounds) };
}

function hasUnresolvedSelfRef(row: Row, table: TableName, maps: Map<TableName, Map<string, string>>): boolean {
  return Object.values(row.v).some((value) => value instanceof Ref && value.table === table && !maps.get(table)?.has(value.nk));
}

function resolveRef(ref: Ref, maps: Map<TableName, Map<string, string>>): string | undefined {
  return maps.get(ref.table)?.get(ref.nk);
}

class Unresolved extends Error {
  constructor(readonly ref: Ref) {
    super(`Unresolved reference ${ref.table}:${ref.nk}`);
  }
}

function deepResolve(value: unknown, maps: Map<TableName, Map<string, string>>): unknown {
  if (value instanceof Ref) {
    const id = resolveRef(value, maps);
    if (id === undefined) throw new Unresolved(value);
    return id;
  }
  if (Array.isArray(value)) return value.map((x) => deepResolve(x, maps));
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, deepResolve(v, maps)]));
}

function toSql(value: Val, maps: Map<TableName, Map<string, string>>, passwords: Passwords): unknown {
  if (value === STAFF_PASSWORD_PLACEHOLDER) return passwords.staffHash;
  if (value === CUSTOMER_PASSWORD_PLACEHOLDER) return passwords.customerHash;
  if (value instanceof Ref) {
    const id = resolveRef(value, maps);
    if (id === undefined) throw new Unresolved(value);
    return id;
  }
  if (value instanceof Date || value === null) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(deepResolve(value, maps));
  return value;
}

export interface TableResult {
  table: SeededTable | 'tenants';
  planned: number;
  inserted: number;
  existing: number;
  skippedOptional: number;
}

export interface GroupResult {
  group: string;
  ok: boolean;
  error?: string;
  tables: TableResult[];
  ms: number;
}

const GROUPS: { name: string; tables: SeededTable[] }[] = [
  { name: 'core (tenant, store, domain, warehouses, staff, tax, theme)', tables: ['stores', 'tenant_domains', 'warehouses', 'users', 'user_roles', 'tax_classes', 'tax_rates', 'banners', 'tenant_themes'] },
  { name: 'catalog (brands, categories, attributes, products, variants, media)', tables: ['brands', 'categories', 'product_attributes', 'products', 'product_variants', 'product_media', 'product_categories', 'product_attribute_values'] },
  { name: 'customers (profiles, addresses)', tables: ['customers', 'customer_addresses'] },
  { name: 'marketing (coupons, gift cards)', tables: ['coupons', 'gift_cards'] },
  {
    name: 'commerce (stock, orders, payments, shipments, returns, ledger, reviews, loyalty, rollups)',
    tables: ['inventory_levels', 'orders', 'order_items', 'order_status_history', 'payments', 'shipments', 'shipment_items', 'shipment_events', 'returns', 'return_items', 'refunds', 'coupon_redemptions', 'inventory_movements', 'loyalty_transactions', 'reviews', 'wishlist_items', 'daily_sales_rollup', 'order_sequences'],
  },
];

function publicIdOf(slug: string, table: string, row: Row): string {
  return deterministicPublicId(row.ts, `${slug}|${table}|${row.nk}`);
}

/** Public ids the writer will assign, for the global-uniqueness check in the dry-run. */
export function derivedPublicIds(ds: TenantDataset): Map<string, string> {
  const out = new Map<string, string>();
  for (const table of TABLE_ORDER) {
    if (!TABLES[table].publicId) continue;
    for (const row of ds.rows[table] ?? []) out.set(`${table}|${publicIdOf(ds.slug, table, row)}`, `${ds.slug}:${row.nk}`);
  }
  out.set(`tenants|${publicIdOf(ds.slug, 'tenants', ds.tenant)}`, `${ds.slug}:tenant`);
  return out;
}

interface InsertOptions {
  batchSize: number;
}

async function insertRows(conn: Conn, gate: WriteGate, slug: string, tenantId: string | null, table: string, desc: { publicId: boolean; tenantScoped: boolean; ts: 'cu' | 'c' | 'u' | 'none' }, rows: Row[], maps: Map<TableName, Map<string, string>>, passwords: Passwords, opts: InsertOptions): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  // Resolve every row first so an unresolved reference fails before any statement is sent.
  const columns = Object.keys(rows[0]!.v);
  const prepared: unknown[][] = [];
  let skipped = 0;
  for (const row of rows) {
    try {
      const values: unknown[] = [];
      if (desc.tenantScoped) values.push(tenantId);
      if (desc.publicId) values.push(publicIdOf(slug, table, row));
      for (const col of columns) {
        const v = row.v[col];
        if (v === undefined) throw new Error(`${table}:${row.nk}.${col} is undefined`);
        values.push(toSql(v, maps, passwords));
      }
      if (desc.ts === 'cu' || desc.ts === 'c') values.push(row.ts);
      if (desc.ts === 'cu' || desc.ts === 'u') values.push(row.updatedAt ?? row.ts);
      prepared.push(values);
    } catch (error) {
      if (error instanceof Unresolved && row.optional) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  const names = [...(desc.tenantScoped ? ['tenant_id'] : []), ...(desc.publicId ? ['public_id'] : []), ...columns, ...(desc.ts === 'cu' || desc.ts === 'c' ? ['created_at'] : []), ...(desc.ts === 'cu' || desc.ts === 'u' ? ['updated_at'] : [])];
  const sql = `INSERT INTO \`${table}\` (${names.map((n) => `\`${n}\``).join(', ')}) VALUES ?`;
  let inserted = 0;
  for (let i = 0; i < prepared.length; i += opts.batchSize) {
    const batch = prepared.slice(i, i + opts.batchSize);
    const affected = await exec(conn, gate, sql, [batch]);
    if (affected !== batch.length) throw new Error(`${table}: expected ${batch.length} inserted rows, database reports ${affected}`);
    inserted += affected;
  }
  return { inserted, skipped };
}

export interface WriteOutcome {
  slug: string;
  tenantId: string | null;
  tenantInserted: boolean;
  groups: GroupResult[];
  ms: number;
}

/** Writes one tenant, one transaction per entity group. A failed group rolls back alone and stops the run. */
export async function writeTenant(pool: { getConnection(): Promise<Conn> }, ds: TenantDataset, gate: WriteGate, passwords: Passwords, opts: InsertOptions, log: (line: string) => void): Promise<WriteOutcome> {
  gate.assert();
  const started = Date.now();
  const conn = await pool.getConnection();
  const groups: GroupResult[] = [];
  let tenantInserted = false;
  let tenantId: string | null = null;
  try {
    await conn.query('SET SESSION TRANSACTION READ WRITE');
    const lookups = await loadLookups(conn);
    if (lookups.roles.size === 0) throw new Error('No system roles found: run the standard `seed` first (roles are platform reference data).');

    // What exists *before this run touched anything*. Owner-managed child rows are judged against this
    // snapshot, never against rows this very run inserted in an earlier group.
    const startTenant = await findTenant(conn, ds.slug);
    const preAtStart: Map<TableName, Set<string>> = startTenant ? await loadPreExisting(conn, startTenant.id) : new Map();

    for (let g = 0; g < GROUPS.length; g += 1) {
      const group = GROUPS[g]!;
      const t0 = Date.now();
      const tables: TableResult[] = [];
      await conn.beginTransaction();
      try {
        // Tenant row lives in the first group so that the tenant and its store commit together.
        if (g === 0) {
          const found = await findTenant(conn, ds.slug);
          if (found) tenantId = found.id;
          else {
            const cols = Object.keys(ds.tenant.v);
            const values = cols.map((c) => toSql(ds.tenant.v[c] as Val, new Map(), passwords));
            const names = ['public_id', ...cols, 'created_at', 'updated_at'];
            const sql = `INSERT INTO \`tenants\` (${names.map((n) => `\`${n}\``).join(', ')}) VALUES ?`;
            await exec(conn, gate, sql, [[[publicIdOf(ds.slug, 'tenants', ds.tenant), ...values, ds.tenant.ts, ds.tenant.updatedAt ?? ds.tenant.ts]]]);
            const created = await findTenant(conn, ds.slug);
            tenantId = created!.id;
            tenantInserted = true;
          }
          tables.push({ table: 'tenants', planned: 1, inserted: tenantInserted ? 1 : 0, existing: tenantInserted ? 0 : 1, skippedOptional: 0 });
        }
        const tid = tenantId as string;
        const maps = new Map<TableName, Map<string, string>>([['roles', lookups.roles], ['theme_templates', lookups.themeTemplates]]);
        // Reference maps for every table with ids already committed (earlier groups and pre-existing rows).
        for (const table of TABLE_ORDER) {
          const desc = TABLES[table];
          if (desc.keySql && desc.referenced) maps.set(table, await loadKeys(conn, desc.keySql, [tid]));
        }
        const work = computeWork(ds, preAtStart, lookups);
        for (const table of group.tables) {
          const w = work.find((x) => x.table === table)!;
          const desc = TABLES[table];
          // Self-referencing tables (category trees) are inserted in waves: parents first, then the rows that point at them.
          let pending = w.toInsert;
          let inserted = 0;
          let skipped = 0;
          while (pending.length > 0) {
            const ready = pending.filter((row) => !hasUnresolvedSelfRef(row, table, maps));
            if (ready.length === 0) throw new Error(`${table}: rows reference each other in a cycle or reference a missing parent`);
            const result = await insertRows(conn, gate, ds.slug, tid, desc.table, desc, ready, maps, passwords, opts);
            inserted += result.inserted;
            skipped += result.skipped;
            if (desc.referenced && desc.keySql) maps.set(table, await loadKeys(conn, desc.keySql, [tid]));
            const done = new Set(ready);
            pending = pending.filter((row) => !done.has(row));
          }
          tables.push({ table, planned: w.planned, inserted, existing: w.existing, skippedOptional: w.skippedOptional + skipped });
          if (table === 'categories' && inserted > 0) {
            await exec(conn, gate, "UPDATE categories SET path = CONCAT('/', id, '/') WHERE tenant_id = ? AND parent_id IS NULL AND path = '/pending/'", [tid]);
            await exec(conn, gate, "UPDATE categories c JOIN categories p ON p.id = c.parent_id SET c.path = CONCAT(p.path, c.id, '/') WHERE c.tenant_id = ? AND c.path = '/pending/'", [tid]);
          }
          if (table === 'users' && tenantInserted && inserted > 0) {
            const ownerId = maps.get('users')?.get(String(ds.tenant.v['contact_email']).toLowerCase());
            if (ownerId) await exec(conn, gate, 'UPDATE tenants SET owner_user_id = ? WHERE id = ? AND owner_user_id IS NULL', [ownerId, tid]);
          }
        }
        await conn.commit();
        groups.push({ group: group.name, ok: true, tables, ms: Date.now() - t0 });
        log(`  [${ds.slug}] ${group.name}: ${tables.map((t) => `${t.table} +${t.inserted}`).join(', ')}`);
      } catch (error) {
        await conn.rollback();
        const message = error instanceof Error ? error.message : String(error);
        groups.push({ group: group.name, ok: false, error: message, tables, ms: Date.now() - t0 });
        log(`  [${ds.slug}] ${group.name}: FAILED and rolled back (${message})`);
        break;
      }
    }
  } finally {
    conn.release();
  }
  return { slug: ds.slug, tenantId, tenantInserted, groups, ms: Date.now() - started };
}
