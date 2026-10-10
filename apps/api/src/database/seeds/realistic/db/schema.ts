import { TABLE_ORDER, Ref, type TenantDataset } from '../types';
import { type Conn, q } from './connection';
import { TABLES } from './tables';

interface ColumnInfo {
  COLUMN_NAME: string;
  IS_NULLABLE: 'YES' | 'NO';
  COLUMN_DEFAULT: string | null;
  EXTRA: string;
  DATA_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH: string | number | null;
}

export interface SchemaProblem {
  table: string;
  problem: string;
}

/**
 * Compares the columns the seeder will write with the live schema (read-only): unknown or generated
 * columns, NOT NULL columns left without a value, and text values longer than their column.
 */
export async function checkSchema(conn: Conn, datasets: TenantDataset[]): Promise<{ problems: SchemaProblem[]; tablesChecked: number }> {
  const problems: SchemaProblem[] = [];
  const dbName = (await q<{ d: string }>(conn, 'SELECT DATABASE() AS d'))[0]!.d;
  const tables = [...TABLE_ORDER.map((t) => TABLES[t].table), 'tenants'];
  for (const table of tables) {
    const cols = await q<ColumnInfo>(
      conn,
      'SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbName, table],
    );
    if (cols.length === 0) {
      problems.push({ table, problem: 'table does not exist in the target database' });
      continue;
    }
    const byName = new Map(cols.map((c) => [c.COLUMN_NAME, c] as const));
    const key = (TABLE_ORDER as readonly string[]).find((t) => TABLES[t as (typeof TABLE_ORDER)[number]].table === table) as (typeof TABLE_ORDER)[number] | undefined;
    const desc = key ? TABLES[key] : null;
    const written = new Set<string>();
    if (desc?.tenantScoped) written.add('tenant_id');
    if (desc?.publicId || table === 'tenants') written.add('public_id');
    if (!desc || desc.ts === 'cu' || desc.ts === 'c') written.add('created_at');
    if (!desc || desc.ts === 'cu' || desc.ts === 'u') written.add('updated_at');

    const sample = datasets.map((d) => (table === 'tenants' ? [d.tenant] : (d.rows[key as (typeof TABLE_ORDER)[number]] ?? []))).find((rows) => rows.length > 0);
    if (!sample) continue;
    for (const col of Object.keys(sample[0]!.v)) written.add(col);

    for (const col of written) {
      const info = byName.get(col);
      if (!info) problems.push({ table, problem: `column \`${col}\` does not exist` });
      else if (/(STORED|VIRTUAL) GENERATED/i.test(info.EXTRA)) problems.push({ table, problem: `column \`${col}\` is generated and must not be written` });
    }
    for (const info of cols) {
      const generated = /(STORED|VIRTUAL) GENERATED/i.test(info.EXTRA);
      const auto = info.EXTRA.toLowerCase().includes('auto_increment');
      if (info.IS_NULLABLE === 'NO' && info.COLUMN_DEFAULT === null && !generated && !auto && !written.has(info.COLUMN_NAME) && !info.EXTRA.toUpperCase().includes('DEFAULT_GENERATED')) {
        problems.push({ table, problem: `NOT NULL column \`${info.COLUMN_NAME}\` has no default and is not written` });
      }
    }
    // Text length.
    for (const rows of datasets.map((d) => (table === 'tenants' ? [d.tenant] : (d.rows[key as (typeof TABLE_ORDER)[number]] ?? [])))) {
      for (const row of rows) {
        for (const [col, value] of Object.entries(row.v)) {
          const info = byName.get(col);
          if (typeof value === 'string' && info?.CHARACTER_MAXIMUM_LENGTH != null && value.length > Number(info.CHARACTER_MAXIMUM_LENGTH) && info.DATA_TYPE !== 'json') {
            problems.push({ table, problem: `${row.nk}.${col} is ${value.length} chars, column holds ${info.CHARACTER_MAXIMUM_LENGTH}` });
          }
          if (value instanceof Ref) continue;
        }
      }
    }
  }
  return { problems: dedupe(problems), tablesChecked: tables.length };
}

function dedupe(problems: SchemaProblem[]): SchemaProblem[] {
  const seen = new Set<string>();
  return problems.filter((p) => {
    const k = `${p.table}|${p.problem}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** CHECK constraints of the tables we write, for the plan's schema section. */
export async function listCheckConstraints(conn: Conn): Promise<{ table: string; name: string; clause: string }[]> {
  const dbName = (await q<{ d: string }>(conn, 'SELECT DATABASE() AS d'))[0]!.d;
  return q(
    conn,
    `SELECT tc.TABLE_NAME AS \`table\`, cc.CONSTRAINT_NAME AS name, cc.CHECK_CLAUSE AS clause
       FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc
         ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND tc.TABLE_NAME IS NOT NULL
      WHERE cc.CONSTRAINT_SCHEMA = ? ORDER BY tc.TABLE_NAME, cc.CONSTRAINT_NAME`,
    [dbName],
  );
}

/**
 * Verifies every value written to a column guarded by a `CHECK (col IN (...))` constraint against the
 * constraint's actual list, so a typo in a status string is a dry-run finding rather than a failed insert.
 */
export function checkEnumConstraints(constraints: { table: string; name: string; clause: string }[], datasets: TenantDataset[]): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  for (const c of constraints) {
    const match = /`([a-z_]+)`\s+in\s*\(([^)]*)\)/i.exec(c.clause.replaceAll('\\', ''));
    if (!match) continue;
    const column = match[1]!;
    const allowed = new Set([...match[2]!.matchAll(/'([^']*)'/g)].map((m) => m[1]!));
    const key = (TABLE_ORDER as readonly string[]).find((t) => TABLES[t as (typeof TABLE_ORDER)[number]].table === c.table) as (typeof TABLE_ORDER)[number] | undefined;
    if (!key) continue;
    const bad = new Set<string>();
    for (const ds of datasets) {
      for (const row of ds.rows[key] ?? []) {
        const value = row.v[column];
        if (typeof value === 'string' && !allowed.has(value)) bad.add(value);
      }
    }
    if (bad.size > 0) problems.push({ table: c.table, problem: `${c.name}: value(s) ${[...bad].map((b) => `'${b}'`).join(', ')} not allowed for \`${column}\` (allowed: ${[...allowed].join(', ')})` });
  }
  return problems;
}
