import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult } from './selfcheck';
import { TABLE_ORDER, type TenantDataset } from './types';
import type { DbCheck, TenantFingerprint } from './db/validate';
import type { TableWork } from './db/engine';
import type { WriteOutcome } from './db/engine';

export function stamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function rupees(minor: string | number): string {
  const n = Number(minor) / 100;
  return `Rs ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export interface PlanLine {
  slug: string;
  tenantExists: boolean;
  work: TableWork[];
}

export function tableRows(plan: PlanLine[]): string {
  const header = `| Table | ${plan.map((p) => p.slug).join(' | ')} |\n|---|${plan.map(() => '---:').join('|')}|`;
  const tenantRow = `| tenants (platform table) | ${plan.map((p) => (p.tenantExists ? '0 (present)' : '1')).join(' | ')} |`;
  const lines = [tenantRow, ...TABLE_ORDER.map((table) => {
    const cells = plan.map((p) => {
      const w = p.work.find((x) => x.table === table)!;
      return w.existing > 0 ? `${w.toInsert.length} new (${w.existing} present)` : String(w.toInsert.length);
    });
    return `| ${table} | ${cells.join(' | ')} |`;
  })];
  const totals = plan.map((p) => String(p.work.reduce((s, w) => s + w.toInsert.length, 0) + (p.tenantExists ? 0 : 1)));
  return `${header}\n${lines.join('\n')}\n| **total rows to insert** | ${totals.map((x) => `**${x}**`).join(' | ')} |`;
}

export interface DryRunReport {
  generatedAt: string;
  target: string;
  offline: boolean;
  seed: number;
  asOf: string;
  datasets: TenantDataset[];
  plan: PlanLine[];
  selfChecks: Map<string, CheckResult[]>;
  globalCheck: CheckResult;
  publicIdCheck: CheckResult;
  configChecks: CheckResult[];
  preflight: string[];
  estimateSeconds: [number, number];
}

export function renderDryRun(r: DryRunReport): string {
  const out: string[] = [];
  out.push(`# Realistic seed: dry-run report`);
  out.push('');
  out.push(`- Generated: ${r.generatedAt}`);
  out.push(`- Mode: **dry-run (read-only)**. No database write was performed.${r.offline ? ' Existing-state lookup was skipped (--offline).' : ''}`);
  out.push(`- Target: \`${r.target}\``);
  out.push(`- Seed: \`${r.seed}\`  As-of date: \`${r.asOf}\``);
  out.push(`- Tenants: ${r.datasets.map((d) => d.slug).join(', ')}`);
  out.push(`- Estimated duration for the writes: ${r.estimateSeconds[0]}-${r.estimateSeconds[1]} seconds in total`);
  out.push('');
  out.push('## Pre-flight');
  out.push(...r.preflight.map((p) => `- ${p}`));
  out.push('');
  out.push('## Rows per table per tenant (to insert)');
  out.push('');
  out.push(tableRows(r.plan));
  out.push('');
  out.push('Rows shown as `n new (m present)` already exist in the database and will be left untouched.');
  out.push('');
  out.push('## Dataset shape per tenant');
  out.push('');
  out.push('| Tenant | Products (variants) | Customers | Orders | Revenue (counted) | First order | Last order |');
  out.push('|---|---:|---:|---:|---:|---|---|');
  for (const d of r.datasets) {
    const s = d.summary;
    out.push(`| ${d.slug} | ${s.products} (${s.variants}) | ${s.customers} | ${s.orders} | ${rupees(s.revenueMinor)} | ${s.firstOrderAt?.slice(0, 10)} | ${s.lastOrderAt?.slice(0, 10)} |`);
  }
  out.push('');
  out.push('### Order status mix');
  out.push('');
  const statuses = [...new Set(r.datasets.flatMap((d) => Object.keys(d.summary.statusCounts)))].sort();
  out.push(`| Status | ${r.datasets.map((d) => d.slug).join(' | ')} |`);
  out.push(`|---|${r.datasets.map(() => '---:').join('|')}|`);
  for (const status of statuses) out.push(`| ${status} | ${r.datasets.map((d) => d.summary.statusCounts[status] ?? 0).join(' | ')} |`);
  out.push('');
  out.push('### Payment method mix');
  out.push('');
  const methods = [...new Set(r.datasets.flatMap((d) => Object.keys(d.summary.paymentMethodCounts)))].sort();
  out.push(`| Method | ${r.datasets.map((d) => d.slug).join(' | ')} |`);
  out.push(`|---|${r.datasets.map(() => '---:').join('|')}|`);
  for (const m of methods) out.push(`| ${m} | ${r.datasets.map((d) => d.summary.paymentMethodCounts[m] ?? 0).join(' | ')} |`);
  out.push('');
  out.push('### GST slabs (products)');
  out.push('');
  const slabs = [...new Set(r.datasets.flatMap((d) => Object.keys(d.summary.gstSlabCounts)))].sort();
  out.push(`| Slab | ${r.datasets.map((d) => d.slug).join(' | ')} |`);
  out.push(`|---|${r.datasets.map(() => '---:').join('|')}|`);
  for (const s of slabs) out.push(`| ${s} | ${r.datasets.map((d) => d.summary.gstSlabCounts[s] ?? 0).join(' | ')} |`);
  out.push('');
  out.push('### Inventory position (stock slots by archetype)');
  out.push('');
  out.push(`| Tenant | healthy | low stock | out of stock |`);
  out.push('|---|---:|---:|---:|');
  for (const d of r.datasets) out.push(`| ${d.slug} | ${d.summary.inventoryArchetypes['healthy'] ?? 0} | ${d.summary.inventoryArchetypes['low'] ?? 0} | ${d.summary.inventoryArchetypes['oos'] ?? 0} |`);
  out.push('');
  out.push('## Generator self-checks (in-memory, before any database access)');
  out.push('');
  for (const d of r.datasets) {
    out.push(`### ${d.slug}`);
    for (const c of r.selfChecks.get(d.slug) ?? []) out.push(`- [${c.ok ? 'x' : ' '}] ${c.name}${c.ok ? '' : ` -- ${c.detail}`}`);
    if (d.warnings.length) out.push(...d.warnings.map((w) => `- WARNING: ${w}`));
    out.push('');
  }
  out.push('### Cross-tenant');
  out.push(`- [${r.globalCheck.ok ? 'x' : ' '}] ${r.globalCheck.name}${r.globalCheck.ok ? '' : ` -- ${r.globalCheck.detail}`}`);
  out.push(`- [${r.publicIdCheck.ok ? 'x' : ' '}] ${r.publicIdCheck.name}${r.publicIdCheck.ok ? '' : ` -- ${r.publicIdCheck.detail}`}`);
  for (const c of r.configChecks) out.push(`- [${c.ok ? 'x' : ' '}] ${c.name}${c.ok ? '' : ` -- ${c.detail}`}`);
  out.push('');
  return out.join('\n');
}

export function renderValidation(opts: { generatedAt: string; target: string; checks: DbCheck[]; protection: string[]; idempotency: string[] }): string {
  const out: string[] = [];
  out.push('# Realistic seed: validation report');
  out.push('');
  out.push(`- Generated: ${opts.generatedAt}`);
  out.push(`- Mode: **validate (read-only SQL session)**`);
  out.push(`- Target: \`${opts.target}\``);
  out.push('');
  const scopes = [...new Set(opts.checks.map((c) => c.scope))];
  for (const scope of scopes) {
    out.push(`## ${scope}`);
    for (const c of opts.checks.filter((x) => x.scope === scope)) out.push(`- [${c.skipped ? '-' : c.ok ? 'x' : ' '}] ${c.name} -- ${c.detail}`);
    out.push('');
  }
  out.push('## Existing tenants and platform data unchanged');
  out.push(...opts.protection.map((p) => `- ${p}`));
  out.push('');
  out.push('## Idempotency');
  out.push(...opts.idempotency.map((p) => `- ${p}`));
  out.push('');
  const failed = opts.checks.filter((c) => !c.ok);
  const skipped = opts.checks.filter((c) => c.skipped).length;
  out.push(`## Result`);
  out.push(failed.length === 0 ? `All checks passed${skipped ? ` (${skipped} tenant(s) not seeded yet, their checks skipped)` : ''}.` : `${failed.length} check(s) failed.`);
  out.push('');
  return out.join('\n');
}

export function renderResult(opts: { generatedAt: string; target: string; seed: number; asOf: string; outcomes: WriteOutcome[]; totalMs: number; protection: string[] }): string {
  const out: string[] = [];
  out.push('# Realistic seed: result report');
  out.push('');
  out.push(`- Generated: ${opts.generatedAt}`);
  out.push(`- Target: \`${opts.target}\``);
  out.push(`- Seed: \`${opts.seed}\`  As-of date: \`${opts.asOf}\``);
  out.push(`- Duration: ${(opts.totalMs / 1000).toFixed(1)} s`);
  out.push('');
  for (const o of opts.outcomes) {
    out.push(`## ${o.slug}`);
    out.push(`- Tenant row ${o.tenantInserted ? 'inserted' : 'already present'}; ${(o.ms / 1000).toFixed(1)} s`);
    out.push('');
    out.push('| Group | Table | Planned | Inserted | Already present | Skipped (optional) |');
    out.push('|---|---|---:|---:|---:|---:|');
    for (const g of o.groups) {
      for (const t of g.tables) out.push(`| ${g.ok ? '' : 'FAILED: '}${g.group.split(' ')[0]} | ${t.table} | ${t.planned} | ${t.inserted} | ${t.existing} | ${t.skippedOptional} |`);
      if (!g.ok) out.push(`| ${g.group.split(' ')[0]} | (rolled back) | | | | ${g.error} |`);
    }
    out.push('');
  }
  out.push('## Existing tenants unchanged');
  out.push(...opts.protection.map((p) => `- ${p}`));
  out.push('');
  return out.join('\n');
}

export function renderLogins(datasets: TenantDataset[], rootDomain: string): string {
  const out: string[] = [];
  out.push('# Realistic seed: logins');
  out.push('');
  out.push('All staff accounts use the shared local demo password documented in `PROJECT_RUN_GUIDE.md` (section 2, "IDs & Passwords"). Customer accounts use the customer demo password from the same section. Passwords and hashes are never written to these reports.');
  out.push('');
  out.push(`Storefront hosts are \`<slug>.${rootDomain}\` (console on \`localhost:3000\`, storefront on port \`3001\`).`);
  out.push('');
  for (const d of datasets) {
    out.push(`## ${d.businessName}`);
    out.push('');
    out.push(`- Slug: \`${d.slug}\``);
    out.push(`- Storefront: \`http://${d.hostname}:3001\``);
    out.push('');
    out.push('| Email | Name | Roles |');
    out.push('|---|---|---|');
    for (const l of d.logins) out.push(`| ${l.email} | ${l.name} | ${l.roles.join(', ')} |`);
    out.push('');
    out.push(`Coupon codes (the INDEP15 and MONSOON ones are past their end date on purpose): ${d.couponCodes.map((c) => `\`${c}\``).join(', ')}`);
    const gifts = d.giftCardCodes.filter((g) => g.status === 'ACTIVE' || g.status === 'PARTIAL').slice(0, 3);
    out.push(`Sample gift cards (demo values): ${gifts.map((g) => `\`${g.code}\` (Rs ${Number(g.initialMinor) / 100})`).join(', ')}`);
    out.push('');
  }
  return out.join('\n');
}

export function writeReport(dir: string, name: string, content: string): string {
  ensureDir(dir);
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

export function compareFingerprints(before: Record<string, TenantFingerprint>, after: Record<string, TenantFingerprint>): string[] {
  const lines: string[] = [];
  for (const slug of Object.keys(before)) {
    const a = after[slug];
    if (!a) {
      lines.push(`${slug}: tenant missing after the run`);
      continue;
    }
    const diffs = Object.keys(before[slug]!).filter((t) => before[slug]![t]!.rows !== a[t]?.rows || before[slug]![t]!.checksum !== a[t]?.checksum);
    const rowCount = Object.values(before[slug]!).reduce((s, f) => s + f.rows, 0);
    lines.push(diffs.length === 0 ? `${slug}: unchanged (${Object.keys(before[slug]!).length} tables fingerprinted, ${rowCount} rows, counts + checksums identical)` : `${slug}: CHANGED in ${diffs.join(', ')}`);
  }
  return lines;
}
