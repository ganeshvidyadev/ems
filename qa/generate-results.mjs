// Builds qa-reports/TEST_RESULTS.md + MODULE_COVERAGE.md tables from qa-reports/results.json.
// Numbers come only from executed tests recorded by run-all.mjs. Informational probes are listed but never counted.
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(import.meta.dirname, '../qa-reports');
const { generatedAt, tests } = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));
const unit = JSON.parse(fs.readFileSync(path.join(out, 'unit-results.json'), 'utf8'));
const bugs = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'bug-registry.json'), 'utf8'));

const INFO = new Set(['DB-008', 'DB-009', 'DB-011', 'SEC-010', 'SEC-014', 'TEN-013', 'SF-025', 'MKT-008']);
const counted = tests.filter((t) => !INFO.has(t.id) || t.status === 'FAIL');
const by = (arr, s) => arr.filter((t) => t.status === s).length;
const prefixMeta = {
  ENV: 'Environment & infrastructure', AUTH: 'Authentication', RBAC: 'Authorization / RBAC', TEN: 'Multi-tenant isolation',
  WEB: 'Website management module (API)', SF: 'Storefront API', WF: 'Merchant -> order workflow', API: 'API contract', SEC: 'Security',
  DB: 'Database integrity', MKT: 'Marketing website (browser)', CON: 'Admin console (browser)', STO: 'Merchant storefront (browser)',
};
const prefix = (t) => t.id.split('-')[0];

const pass = by(counted, 'PASS'), fail = by(counted, 'FAIL'), blocked = by(counted, 'BLOCKED'), notTested = by(counted, 'NOT_TESTED');
const unitPass = unit.reduce((a, u) => a + u.passed, 0);
const bugCount = (sev) => bugs.filter((b) => b.severity === sev && b.status === 'CONFIRMED').length;
const rate = (p, f) => (p + f ? `${((p / (p + f)) * 100).toFixed(1)}%` : 'n/a');

let md = `# EMS QA — Test Results\n\nGenerated: ${generatedAt} (local environment, API/console/storefront/marketing dev servers, MySQL 8.4 :3307, Mongo :27017, cache Redis cloud). Source of truth: \`qa-reports/results.json\` + raw spec output in \`qa-reports/raw/\`.\n\n`;
md += `## Execution summary — black-box QA suite (\`qa/\`)\n\n| Metric | Result |\n|---|---|\n`;
md += `| Total Test Cases (counted) | ${counted.length} |\n| Passed | ${pass} |\n| Failed | ${fail} |\n| Blocked | ${blocked} |\n| Not Tested | ${notTested} |\n`;
md += `| Pass rate (PASS / (PASS + FAIL), executed only) | ${rate(pass, fail)} |\n| Critical Bugs (confirmed) | ${bugCount('Critical')} |\n| High Bugs (confirmed) | ${bugCount('High')} |\n| Medium Bugs (confirmed) | ${bugCount('Medium')} |\n| Low Bugs (confirmed) | ${bugCount('Low')} |\n\n`;
md += `Blocked and Not Tested are shown separately and are **not** in the pass rate. ${tests.length - counted.length} informational probes are listed below but not counted as pass/fail evidence.\n\n`;
md += `## Existing product tests (executed this run)\n\n| Suite | Result |\n|---|---|\n`;
for (const u of unit) md += `| ${u.name} | ${u.status} — ${u.passed}/${u.total} tests, ${u.suites} suites |\n`;
md += `| apps/api jest **integration** tier | NOT_IMPLEMENTED — \`test/integration/\` directory does not exist (0 specs) |\n`;
md += `| apps/api jest **tenant-isolation** tier (\`test:isolation\`) | BLOCKED — needs a clean \`ems_test\` database + queue Redis :6380 (unavailable); not run |\n`;
md += `| apps/api jest **e2e** tier (\`test:e2e\`) | BLOCKED — same prerequisites; not run |\n`;
md += `| contracts / console / storefront / marketing unit tests | NOT_IMPLEMENTED — no spec files in these packages |\n`;
md += `| typecheck (contracts, api, console, marketing) | PASS (run earlier this session; no errors) |\n`;
md += `| lint (api, console) | FAIL — pre-existing: api 7 errors/3 warnings, console errors in unrelated files (see BUG_REPORT OBS-002); marketing lint PASS |\n\n`;

md += `## Results by area\n\n| Area | Pass | Fail | Blocked | Not tested | Pass rate |\n|---|---|---|---|---|---|\n`;
for (const [p, label] of Object.entries(prefixMeta)) {
  const rows = counted.filter((t) => prefix(t) === p);
  if (!rows.length) continue;
  md += `| ${label} | ${by(rows, 'PASS')} | ${by(rows, 'FAIL')} | ${by(rows, 'BLOCKED')} | ${by(rows, 'NOT_TESTED')} | ${rate(by(rows, 'PASS'), by(rows, 'FAIL'))} |\n`;
}
md += `\n## Failed tests (after one automatic re-run)\n\n| ID | Test | Re-run | Linked bug | Evidence |\n|---|---|---|---|---|\n`;
for (const t of tests.filter((x) => x.status === 'FAIL')) {
  const bug = bugs.find((b) => b.tests?.includes(t.id));
  md += `| ${t.id} | ${t.title.replace(/\|/g, '/')} | ${t.flaky ? '**FLAKY** (passed on retry)' : t.retry ?? 'not re-run'} | ${bug ? bug.id : '—'} | ${(t.message ?? '').replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 160)} |\n`;
}
md += `\n## Blocked / not tested\n\n| ID | Reason |\n|---|---|\n`;
for (const t of tests.filter((x) => x.status === 'BLOCKED' || x.status === 'NOT_TESTED')) md += `| ${t.id} ${t.status} | ${t.note || t.title} |\n`;
md += `\n## Informational probes (not counted)\n\n`;
for (const t of tests.filter((x) => INFO.has(x.id) && x.status !== 'FAIL')) md += `- ${t.id}: ${t.title}\n`;
md += `\n## Full list\n\n| ID | Status | Test | File |\n|---|---|---|---|\n`;
for (const t of tests) md += `| ${t.id} | ${t.status}${INFO.has(t.id) ? ' (info)' : ''}${t.flaky ? ' (flaky)' : ''} | ${t.title.replace(/\|/g, '/')} | ${t.file} |\n`;
fs.writeFileSync(path.join(out, 'TEST_RESULTS.md'), md);
console.log(`TEST_RESULTS.md written: counted=${counted.length} pass=${pass} fail=${fail} blocked=${blocked} notTested=${notTested}`);
