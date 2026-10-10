import 'reflect-metadata';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findSpec, TENANT_SPECS } from './catalogs';
import { createPool, describeTarget, loadEnv, resolveTarget, targetProblems, type Conn, withReadOnly } from './db/connection';
import {
  computeWork,
  derivedPublicIds,
  findTenant,
  loadLookups,
  loadPreExisting,
  makePasswordHashes,
  type TableWork,
  WriteGate,
  writeTenant,
  type WriteOutcome,
} from './db/engine';
import { q } from './db/connection';
import { countPlatformRows, fingerprintTenant, type DbCheck, type TenantFingerprint, validateTenant } from './db/validate';
import { buildTenantDataset } from './dataset';
import { MS_DAY, parseDay } from './dates';
import {
  compareFingerprints,
  ensureDir,
  type PlanLine,
  renderDryRun,
  renderLogins,
  renderResult,
  renderValidation,
  stamp,
  writeReport,
} from './report';
import { checkDataset, checkGlobalUniqueness, type CheckResult } from './selfcheck';
import { checkDeterminism, checkIdempotency, checkTableConstraints, checkWriterConfig } from './plancheck';
import { checkEnumConstraints, checkSchema, listCheckConstraints } from './db/schema';
import type { DatasetOptions, TenantDataset } from './types';

const DEFAULT_SEED = 20260101;
const DEFAULT_AS_OF = '2026-10-10';
const DEFAULT_BATCH = 250;

interface Cli {
  mode: 'dry-run' | 'validate' | 'write';
  tenants: string[];
  seed: number;
  asOf: string;
  batchSize: number;
  offline: boolean;
  snapshot: boolean;
  reportDir: string;
  allowDbs: string[];
  validateAfterWrite: boolean;
  allowPendingMigrations: boolean;
  noReports: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = {
    mode: 'dry-run',
    tenants: [],
    seed: DEFAULT_SEED,
    asOf: DEFAULT_AS_OF,
    batchSize: DEFAULT_BATCH,
    offline: false,
    snapshot: false,
    reportDir: resolve(__dirname, '../../../../../../seed-reports'),
    allowDbs: [],
    validateAfterWrite: false,
    allowPendingMigrations: false,
    noReports: false,
    help: false,
  };
  let approve = false;
  let validate = false;
  for (const arg of argv) {
    const [flag, value] = arg.split('=') as [string, string | undefined];
    switch (flag) {
      case '--dry-run': break;
      case '--validate': validate = true; break;
      case '--approve-writes': approve = true; break;
      case '--tenant': if (value) cli.tenants.push(value); break;
      case '--as-of': if (value) cli.asOf = value; break;
      case '--seed': if (value) cli.seed = Number(value); break;
      case '--batch-size': if (value) cli.batchSize = Number(value); break;
      case '--offline': cli.offline = true; break;
      case '--snapshot': cli.snapshot = true; break;
      case '--report-dir': if (value) cli.reportDir = resolve(value); break;
      case '--allow-db': if (value) cli.allowDbs.push(value); break;
      case '--no-reports': cli.noReports = true; break;
      case '--allow-pending-migrations': cli.allowPendingMigrations = true; break;
      case '--help': case '-h': cli.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (approve) {
    cli.mode = 'write';
    cli.validateAfterWrite = validate;
  } else if (validate) cli.mode = 'validate';
  if (!Number.isInteger(cli.seed)) throw new Error('--seed must be an integer');
  if (!Number.isInteger(cli.batchSize) || cli.batchSize < 10 || cli.batchSize > 2000) throw new Error('--batch-size must be an integer between 10 and 2000');
  parseDay(cli.asOf);
  for (const t of cli.tenants) if (!findSpec(t)) throw new Error(`Unknown tenant "${t}". Known: ${TENANT_SPECS.map((s) => s.slug).join(', ')}`);
  return cli;
}

const HELP = `Realistic demo data seeder (deterministic, idempotent, additive only)

Usage (from apps/api):
  node ../../node_modules/ts-node/dist/bin.js -r tsconfig-paths/register src/database/seeds/realistic/seed-realistic.ts [options]

Modes:
  --dry-run (default)   Build everything in memory, read the database read-only, write the plan. Changes nothing.
  --validate            Read-only checks of already-seeded tenants and of untouched existing tenants.
  --approve-writes      Perform the inserts. Required for ANY write. Refused unless the target is a local dev database.

Options:
  --tenant=<slug>       Limit to one tenant (repeatable). Default: all five.
  --as-of=YYYY-MM-DD    Fixed "today" for all dates (default ${DEFAULT_AS_OF}).
  --seed=<int>          PRNG seed (default ${DEFAULT_SEED}).
  --batch-size=<n>      Rows per INSERT (default ${DEFAULT_BATCH}).
  --offline             Dry-run without connecting to the database (existing state is not checked).
  --snapshot            Also record a fingerprint of the untouched tenants into seed-reports/.
  --allow-db=<name>     Explicitly allow a database name other than ems / ems_test.
  --allow-pending-migrations  Proceed although a migration is pending (only if it does not touch the seeded tables).
  --report-dir=<dir>    Where reports are written (default <repo>/seed-reports).
`;

function selected(cli: Cli): TenantDataset[] {
  const opts: DatasetOptions = { seed: cli.seed, asOf: cli.asOf, rootDomain: process.env.PLATFORM_ROOT_DOMAIN ?? 'ems.localhost' };
  const slugs = cli.tenants.length > 0 ? cli.tenants : TENANT_SPECS.map((s) => s.slug);
  return slugs.map((slug) => buildTenantDataset(findSpec(slug)!, opts));
}

function migrationNames(): string[] {
  const dir = resolve(__dirname, '../../migrations');
  return readdirSync(dir)
    .map((f) => /^(\d+)-(.+)\.ts$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => `${m[2]}${m[1]}`);
}

async function preflight(conn: Conn, cli: Cli, datasets: TenantDataset[]): Promise<{ lines: string[]; blocking: string[] }> {
  const lines: string[] = [];
  const blocking: string[] = [];
  const version = (await q<{ v: string; db: string }>(conn, 'SELECT VERSION() AS v, DATABASE() AS db'))[0];
  lines.push(`Connected: MySQL/MariaDB ${version?.v ?? '?'}, database "${version?.db ?? '?'}"`);
  try {
    const applied = new Set((await q<{ name: string }>(conn, 'SELECT name FROM migrations')).map((r) => r.name));
    const pending = migrationNames().filter((n) => !applied.has(n));
    if (pending.length > 0 && !cli.allowPendingMigrations) {
      blocking.push(`Pending migrations: ${pending.join(', ')}. Run migrations first (or pass --allow-pending-migrations if they do not touch seeded tables).`);
      lines.push(`Migrations: ${pending.length} pending (blocking): ${pending.join(', ')}`);
    } else if (pending.length > 0) lines.push(`Migrations: ${pending.length} pending (${pending.join(', ')}), bypassed with --allow-pending-migrations`);
    else lines.push(`Migrations: all ${applied.size} applied`);
  } catch (error) {
    blocking.push(`Cannot read the migrations table: ${error instanceof Error ? error.message : String(error)}`);
  }
  const lookups = await loadLookups(conn);
  lines.push(`System roles present: ${lookups.roles.size}${lookups.roles.size === 0 ? ' (blocking: run the standard seed first)' : ''}`);
  if (lookups.roles.size === 0) blocking.push('No system roles: run the standard `seed` first.');
  for (const code of ['STORE_OWNER', 'STORE_ADMIN', 'PRODUCT_MANAGER', 'ORDER_MANAGER', 'INVENTORY_MANAGER', 'MARKETING_MANAGER', 'CUSTOMER_SUPPORT']) {
    if (!lookups.roles.has(code)) blocking.push(`System role ${code} is missing`);
  }
  const schema = await checkSchema(conn, datasets);
  const enums = checkEnumConstraints(await listCheckConstraints(conn), datasets);
  lines.push(`Live-schema compatibility: ${schema.tablesChecked} tables checked, ${schema.problems.length + enums.length} problem(s)`);
  for (const p of [...schema.problems, ...enums]) blocking.push(`Schema: ${p.table}: ${p.problem}`);
  lines.push(`Theme templates present: ${lookups.themeTemplates.size} (${[...lookups.themeTemplates.keys()].join(', ') || 'none'})`);
  return { lines, blocking };
}

function summarizeSelfChecks(datasets: TenantDataset[], now: Date, opts: DatasetOptions): { byTenant: Map<string, CheckResult[]>; global: CheckResult; publicIds: CheckResult; config: CheckResult[]; failures: number } {
  const byTenant = new Map<string, CheckResult[]>();
  let failures = 0;
  for (const ds of datasets) {
    const results = [...checkDataset(ds, now), checkTableConstraints(ds), checkDeterminism(findSpec(ds.slug)!, opts, ds)];
    failures += results.filter((r) => !r.ok).length;
    byTenant.set(ds.slug, results);
  }
  const global = checkGlobalUniqueness(datasets);
  if (!global.ok) failures += 1;
  const config = [checkWriterConfig(datasets), checkIdempotency(datasets)];
  failures += config.filter((c) => !c.ok).length;
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const ds of datasets) {
    for (const [key, owner] of derivedPublicIds(ds)) {
      const prior = seen.get(key);
      if (prior && prior !== owner) dupes.push(`${key} (${prior} / ${owner})`);
      seen.set(key, owner);
    }
  }
  const publicIds: CheckResult = { name: 'deterministic public ids are unique within each table across all tenants', ok: dupes.length === 0, detail: dupes.slice(0, 3).join('; ') };
  if (!publicIds.ok) failures += 1;
  return { byTenant, global, publicIds, config, failures };
}

async function planFor(conn: Conn | null, datasets: TenantDataset[]): Promise<PlanLine[]> {
  const lookups = conn ? await loadLookups(conn) : null;
  const plan: PlanLine[] = [];
  for (const ds of datasets) {
    let pre = new Map();
    let exists = false;
    if (conn) {
      const tenant = await findTenant(conn, ds.slug);
      if (tenant) {
        exists = true;
        pre = await loadPreExisting(conn, tenant.id);
      }
    }
    // Tenant itself is a global row: counted separately in the report header.
    const work: TableWork[] = computeWork(ds, pre, lookups);
    plan.push({ slug: ds.slug, tenantExists: exists, work });
  }
  return plan;
}

async function untouchedFingerprints(conn: Conn, seededSlugs: string[]): Promise<Record<string, TenantFingerprint>> {
  const tenants = await q<{ id: string; slug: string }>(conn, 'SELECT id, slug FROM tenants ORDER BY id');
  const result: Record<string, TenantFingerprint> = {};
  for (const t of tenants) {
    if (seededSlugs.includes(t.slug)) continue;
    result[t.slug] = await fingerprintTenant(conn, String(t.id));
  }
  return result;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    console.log(HELP);
    return;
  }
  loadEnv();
  const target = resolveTarget();
  const problems = targetProblems(target, cli.allowDbs);
  console.log(`TARGET  ${describeTarget(target)}`);
  console.log(`MODE    ${cli.mode}${cli.offline ? ' (offline)' : ''}   seed=${cli.seed}   as-of=${cli.asOf}`);
  if (problems.length > 0) {
    console.error(`REFUSED: ${problems.join('; ')}`);
    process.exitCode = 2;
    return;
  }
  if (cli.mode === 'write' && cli.offline) throw new Error('--offline cannot be combined with --approve-writes');

  const startedAt = new Date();
  const asOfEnd = new Date(parseDay(cli.asOf).getTime() + 12 * 3_600_000);
  const datasets = selected(cli);
  const checks = summarizeSelfChecks(datasets, asOfEnd, { seed: cli.seed, asOf: cli.asOf, rootDomain: process.env.PLATFORM_ROOT_DOMAIN ?? 'ems.localhost' });
  const totalRows = (plan: PlanLine[]): number => plan.reduce((s, p) => s + p.work.reduce((a, w) => a + w.toInsert.length, 0), 0);
  if (checks.failures > 0) {
    console.error(`Generator self-checks failed (${checks.failures}); refusing to continue.`);
    for (const [slug, list] of checks.byTenant) for (const c of list.filter((x) => !x.ok)) console.error(`  ${slug}: ${c.name}: ${c.detail}`);
    if (!checks.global.ok) console.error(`  ${checks.global.name}: ${checks.global.detail}`);
    for (const c of checks.config.filter((x) => !x.ok)) console.error(`  ${c.name}: ${c.detail}`);
    if (!checks.publicIds.ok) console.error(`  ${checks.publicIds.name}: ${checks.publicIds.detail}`);
    process.exitCode = 1;
    return;
  }

  if (cli.mode === 'dry-run' && cli.offline) {
    const plan = await planFor(null, datasets);
    const est = estimate(totalRows(plan));
    const text = renderDryRun({ generatedAt: startedAt.toISOString(), target: describeTarget(target), offline: true, seed: cli.seed, asOf: cli.asOf, datasets, plan, selfChecks: checks.byTenant, globalCheck: checks.global, publicIdCheck: checks.publicIds, configChecks: checks.config, preflight: ['Offline: the database was not contacted; every row is shown as new.'], estimateSeconds: est });
    emit(cli, `SEED_DRYRUN_${stamp(startedAt)}.md`, text);
    emit(cli, 'LOGINS.md', renderLogins(datasets, process.env.PLATFORM_ROOT_DOMAIN ?? 'ems.localhost'));
    printPlan(plan);
    return;
  }

  const pool = createPool();
  try {
    if (cli.mode === 'dry-run') {
      const outcome = await withReadOnly(pool, async (conn) => {
        const pre = await preflight(conn, cli, datasets);
        const plan = await planFor(conn, datasets);
        const fingerprints = cli.snapshot ? await untouchedFingerprints(conn, datasets.map((d) => d.slug)) : null;
        return { pre, plan, fingerprints };
      });
      const est = estimate(totalRows(outcome.plan));
      const text = renderDryRun({ generatedAt: startedAt.toISOString(), target: describeTarget(target), offline: false, seed: cli.seed, asOf: cli.asOf, datasets, plan: outcome.plan, selfChecks: checks.byTenant, globalCheck: checks.global, publicIdCheck: checks.publicIds, configChecks: checks.config, preflight: [...outcome.pre.lines, ...outcome.pre.blocking.map((b) => `BLOCKING: ${b}`)], estimateSeconds: est });
      emit(cli, `SEED_DRYRUN_${stamp(startedAt)}.md`, text);
      emit(cli, 'LOGINS.md', renderLogins(datasets, process.env.PLATFORM_ROOT_DOMAIN ?? 'ems.localhost'));
      if (outcome.fingerprints) writeSnapshot(cli, outcome.fingerprints);
      outcome.pre.lines.forEach((l) => console.log(`PREFLIGHT ${l}`));
      outcome.pre.blocking.forEach((l) => console.log(`BLOCKING  ${l}`));
      printPlan(outcome.plan);
      console.log(`ESTIMATE ${est[0]}-${est[1]} s for ${totalRows(outcome.plan)} rows`);
      return;
    }

    if (cli.mode === 'validate') {
      const result = await withReadOnly(pool, async (conn) => runValidation(conn, cli, datasets, asOfEnd, false));
      const text = renderValidation({ generatedAt: startedAt.toISOString(), target: describeTarget(target), checks: result.checks, protection: result.protection, idempotency: result.idempotency });
      emit(cli, `SEED_VALIDATION_${stamp(startedAt)}.md`, text);
      const failed = result.checks.filter((c) => !c.ok);
      for (const c of result.checks) console.log(`${c.skipped ? 'SKIP' : c.ok ? 'PASS' : 'FAIL'} [${c.scope}] ${c.name}${c.ok ? '' : ` :: ${c.detail}`}`);
      result.protection.forEach((l) => console.log(`PROTECT ${l}`));
      result.idempotency.forEach((l) => console.log(`IDEMPOTENCY ${l}`));
      process.exitCode = failed.length === 0 ? 0 : 1;
      return;
    }

    // ---- write mode: the only path that can change the database --------------------------------
    const gate = new WriteGate(true);
    const pre = await withReadOnly(pool, async (conn) => {
      const p = await preflight(conn, cli, datasets);
      const plan = await planFor(conn, datasets);
      const before = await untouchedFingerprints(conn, datasets.map((d) => d.slug));
      const platformBefore = await countPlatformRows(conn);
      return { p, plan, before, platformBefore };
    });
    if (pre.p.blocking.length > 0) {
      console.error(`REFUSED: ${pre.p.blocking.join('; ')}`);
      process.exitCode = 2;
      return;
    }
    console.log(`WRITE   inserting ${totalRows(pre.plan)} rows for ${datasets.map((d) => d.slug).join(', ')} (additive only)`);
    writeSnapshot(cli, pre.before, `baseline-before-${stamp(startedAt)}.json`);
    const passwords = await makePasswordHashes();
    const outcomes: WriteOutcome[] = [];
    const t0 = Date.now();
    for (const ds of datasets) {
      const outcome = await writeTenant(pool, ds, gate, passwords, { batchSize: cli.batchSize }, (line) => console.log(line));
      outcomes.push(outcome);
      if (outcome.groups.some((g) => !g.ok)) {
        console.error(`Stopping: ${ds.slug} had a failed group (rolled back). Re-run to converge.`);
        break;
      }
    }
    const after = await withReadOnly(pool, async (conn) => ({ fingerprints: await untouchedFingerprints(conn, datasets.map((d) => d.slug)), platform: await countPlatformRows(conn), plan: await planFor(conn, datasets) }));
    const protection = [...compareFingerprints(pre.before, after.fingerprints), `platform tables: ${JSON.stringify(pre.platformBefore)} -> ${JSON.stringify(after.platform)} (tenants +${(after.platform['tenants'] ?? 0) - (pre.platformBefore['tenants'] ?? 0)}, users +${(after.platform['users'] ?? 0) - (pre.platformBefore['users'] ?? 0)}; roles/permissions/plans/theme_templates must not change)`, `post-run dry-run plan: ${totalRows(after.plan)} row(s) would still be inserted (0 proves idempotency)`];
    emit(cli, `SEED_RESULT_${stamp(startedAt)}.md`, renderResult({ generatedAt: startedAt.toISOString(), target: describeTarget(target), seed: cli.seed, asOf: cli.asOf, outcomes, totalMs: Date.now() - t0, protection }));
    protection.forEach((l) => console.log(`PROTECT ${l}`));
    if (cli.validateAfterWrite) {
      const v = await withReadOnly(pool, async (conn) => runValidation(conn, cli, datasets, asOfEnd, true));
      emit(cli, `SEED_VALIDATION_${stamp(startedAt)}.md`, renderValidation({ generatedAt: startedAt.toISOString(), target: describeTarget(target), checks: v.checks, protection: v.protection, idempotency: v.idempotency }));
      for (const c of v.checks) console.log(`${c.skipped ? 'SKIP' : c.ok ? 'PASS' : 'FAIL'} [${c.scope}] ${c.name}${c.ok ? '' : ` :: ${c.detail}`}`);
    }
  } finally {
    await pool.end();
  }
}

function estimate(rows: number): [number, number] {
  // Batched multi-row INSERTs run at several thousand rows per second locally; bcrypt dominates small runs.
  const base = rows / 4000;
  return [Math.max(3, Math.round(base + 2)), Math.max(8, Math.round(base * 3 + 6))];
}

function printPlan(plan: PlanLine[]): void {
  for (const p of plan) {
    const insert = p.work.reduce((s, w) => s + w.toInsert.length, 0);
    const present = p.work.reduce((s, w) => s + w.existing, 0);
    console.log(`PLAN ${p.slug.padEnd(20)} tenant:${p.tenantExists ? 'exists' : 'new   '}  insert ${String(insert).padStart(6)}  already present ${String(present).padStart(6)}`);
    console.log(`     ${p.work.filter((w) => w.planned > 0).map((w) => `${w.table}=${w.toInsert.length}`).join(' ')}`);
  }
}

function emit(cli: Cli, name: string, content: string): void {
  if (cli.noReports) return;
  const path = writeReport(cli.reportDir, name, content);
  console.log(`REPORT  ${path}`);
}

function writeSnapshot(cli: Cli, data: Record<string, TenantFingerprint>, name = 'baseline-existing-tenants.json'): void {
  if (cli.noReports) return;
  ensureDir(cli.reportDir);
  const path = join(cli.reportDir, name);
  writeFileSync(path, JSON.stringify({ takenWith: 'seed-realistic', tenants: data }, null, 2), 'utf8');
  console.log(`REPORT  ${path}`);
}

async function runValidation(conn: Conn, cli: Cli, datasets: TenantDataset[], asOfEnd: Date, requireSeeded: boolean): Promise<{ checks: DbCheck[]; protection: string[]; idempotency: string[] }> {
  const checks: DbCheck[] = [];
  const idempotency: string[] = [];
  const historyStart = new Date(asOfEnd.getTime() - 180 * MS_DAY);
  const lookups = await loadLookups(conn);
  for (const ds of datasets) {
    const tenant = await findTenant(conn, ds.slug);
    checks.push(...(await validateTenant(conn, { slug: ds.slug, asOfEnd, historyStart, requireSeeded })));
    if (tenant) {
      const pre = await loadPreExisting(conn, tenant.id);
      const work = computeWork(ds, pre, lookups);
      const remaining = work.reduce((s, w) => s + w.toInsert.length, 0);
      idempotency.push(`${ds.slug}: re-running the seed would insert ${remaining} row(s)${remaining === 0 ? ' (idempotent)' : ' (not yet fully seeded, or data differs)'}`);
      checks.push({ scope: ds.slug, name: 'idempotency: a second dry-run plans 0 inserts', ok: remaining === 0, detail: `${remaining} planned` });
    }
  }
  const baselinePath = join(cli.reportDir, 'baseline-existing-tenants.json');
  const protection: string[] = [];
  const current = await untouchedFingerprints(conn, datasets.map((d) => d.slug));
  if (existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as { tenants: Record<string, TenantFingerprint> };
    const lines = compareFingerprints(baseline.tenants, current);
    protection.push(...lines);
    for (const line of lines) checks.push({ scope: 'existing tenants', name: `unchanged vs baseline: ${line.split(':')[0]}`, ok: !line.includes('CHANGED') && !line.includes('missing'), detail: line });
  } else {
    protection.push(`No baseline file at ${baselinePath}; current fingerprints: ${Object.entries(current).map(([slug, f]) => `${slug} (${Object.values(f).reduce((s, x) => s + x.rows, 0)} rows)`).join(', ') || 'none'}. Run --dry-run --snapshot to create one.`);
  }
  return { checks, protection, idempotency };
}

main().catch((error: unknown) => {
  console.error('Seeding failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
