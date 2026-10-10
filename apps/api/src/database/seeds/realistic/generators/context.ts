import type { DatasetOptions, Row, TableName, TableRows, TenantSpec, Val } from '../types';
import { Ref } from '../types';
import { MS_DAY, parseDay } from '../dates';
import { rngFor, type Rng } from '../rng';

/** Placeholder replaced by a real bcrypt hash only at write time (staff users). */
export const STAFF_PASSWORD_PLACEHOLDER = '@@STAFF_PASSWORD_HASH@@';
/** Placeholder replaced by a real bcrypt hash only at write time (customers). */
export const CUSTOMER_PASSWORD_PLACEHOLDER = '@@CUSTOMER_PASSWORD_HASH@@';

/** Number of days of order history, ending at the as-of date. */
export const HISTORY_DAYS = 180;

export class Sink {
  readonly rows: TableRows = {};

  add(table: TableName, row: Row): Row {
    const list = (this.rows[table] ??= []);
    list.push(row);
    return row;
  }

  count(table: TableName): number {
    return this.rows[table]?.length ?? 0;
  }
}

export interface Ctx {
  spec: TenantSpec;
  opts: DatasetOptions;
  sink: Sink;
  /** The fixed "now": the as-of date at 12:00 UTC (17:30 IST). No event may be later. */
  now: Date;
  /** When the tenant was provisioned (about seven months before now). */
  tenantCreatedAt: Date;
  /** Start of the order-history window. */
  historyStart: Date;
  warnings: string[];
  giftCardCodes: { code: string; initialMinor: string; status: string }[];
  rng(kind: string, index?: number | string): Rng;
  ref(table: TableName, nk: string): Ref;
}

export function makeCtx(spec: TenantSpec, opts: DatasetOptions): Ctx {
  const now = new Date(parseDay(opts.asOf).getTime() + 12 * 3_600_000);
  return {
    spec,
    opts,
    sink: new Sink(),
    now,
    tenantCreatedAt: new Date(now.getTime() - 215 * MS_DAY),
    historyStart: new Date(now.getTime() - HISTORY_DAYS * MS_DAY),
    warnings: [],
    giftCardCodes: [],
    rng: (kind, index = 0) => rngFor(opts.seed, spec.slug, kind, index),
    ref: (table, nk) => new Ref(table, nk),
  };
}

/** `Val` helper for optional values. */
export function orNull<T extends Val>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/** Placeholder image URL: stable, text-based, no binary uploads, same URL on every run. */
export function placeholderImage(width: number, height: number, bg: string, fg: string, text: string): string {
  const label = encodeURIComponent(text.replace(/\s+/g, ' ').trim()).replace(/%20/g, '+');
  return `https://placehold.co/${width}x${height}/${bg}/${fg}.png?text=${label}`;
}

export function rupeesToMinor(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Login email of a staff user: `owner@<slug>.test` for the owner, `first.last@<slug>.test` otherwise. */
export function staffEmail(spec: TenantSpec, key: string): string {
  const s = spec.staff.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown staff key ${key}`);
  return key === 'owner' ? `owner@${spec.slug}.test` : `${s.first}.${s.last}`.toLowerCase().replace(/[^a-z.]/g, '') + `@${spec.slug}.test`;
}
