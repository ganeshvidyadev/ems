// Renders qa-reports/BUG_REPORT.md from qa/bug-registry.json (single source of truth for bug data).
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(import.meta.dirname, '../qa-reports');
const bugs = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'bug-registry.json'), 'utf8'));
const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
bugs.sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id));

let md = '# EMS QA — Bug Report\n\n';
md += 'Every bug below was reproduced by an executed test or probe in this run unless marked **SUSPECTED**. ' +
  'Confirmed cross-tenant data exposure would be CRITICAL: **none was found** (see SECURITY_FINDINGS.md). ' +
  'No product code was changed.\n\n';
md += '| ID | Severity | Status | Module | Title | Tests |\n|---|---|---|---|---|---|\n';
for (const b of bugs) md += `| ${b.id} | ${b.severity} | ${b.status} | ${b.module} | ${b.title} | ${(b.tests ?? []).join(', ') || '—'} |\n`;
md += '\n---\n';
for (const b of bugs) {
  md += `\n## ${b.id} — ${b.title}\n\n- **Module:** ${b.module}\n- **Severity:** ${b.severity}\n- **Status:** ${b.status}\n- **API endpoint / UI route:** \`${b.route}\`\n`;
  md += `- **Preconditions:** ${b.preconditions}\n- **Reproduction steps:**\n${b.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n`;
  md += `- **Expected result:** ${b.expected}\n- **Actual result:** ${b.actual}\n- **Evidence / logs:** ${b.evidence}\n`;
  md += `- **Screenshot / trace:** see \`qa-reports/screenshots/\` and \`qa-reports/raw/\`\n- **Suspected root cause:** ${b.root_cause}\n- **Suggested fix:** ${b.fix}\n- **Regression test recommendation:** ${b.regression}\n`;
}
md += `\n---\n\n## Suspected issues from code review (NOT reproduced — need verification)\n
These come from reading the code (API inventory), not from execution. They are not counted as confirmed bugs.

| ID | Sev (est.) | Suspicion | Where |
|---|---|---|---|
| SUS-001 | High | \`PlatformTenantService.create\` provisions the owner with the fixed password \`DemoPassword123!\` (email pre-verified, ACTIVE). Not exercised because it would create a tenant. | apps/api/src/modules/platform-tenant/platform-tenant.service.ts (~l.225) |
| SUS-002 | Medium | \`POST /platform/tenants/:id/subscription/change-plan\` requires \`platform.plan:assign\`, a permission missing from the catalogue, so no role can call it. | platform-tenant.controller.ts:125, permissions.seed.ts |
| SUS-003 | High | TenantStatusGuard skips @Public() routes, so a SUSPENDED/CANCELLED tenant's storefront and checkout keep serving. Not exercised (would suspend a demo tenant). | common/guards/tenant-status.guard.ts:49-56 |
| SUS-004 | Medium | Loyalty earn/redeem and gift-card reversal are not wired into checkout/cancel; order cancel does not refund captured money. | loyalty.service.ts, order.service.ts:92-166 |
| SUS-005 | Medium | Platform invoice-payment refund is bookkeeping only (no gateway call). | platform-billing.service.ts:111-135 |
| SUS-006 | Medium | Recurring subscription renewal/trial-expiry processors do not exist (SUBSCRIPTION_BILLING and 4 other queues have no processor). | queues/queue.module.ts |
| SUS-007 | Medium | Only one plan quota (\`max_products\`) is enforced; other limits and feature entitlements are not. | product.controller.ts:92 |
| SUS-008 | Low | route-exposure CI gate pins ~21 of ~63 public routes (stale allowlist). | test/unit/route-exposure.spec.ts |
| SUS-009 | Medium | Payment gateway credentials are platform-wide (no per-tenant merchant account). | integrations/payment/payment-gateway.factory.ts |

## Observations (not defects in behaviour)

- **OBS-001** TypeORM \`schema:log\` reports ~430 drift statements (index/FK names differ from the hand-written migrations). \`synchronize\` is off so there is no runtime impact, but \`migration:generate\` output would be noisy.
- **OBS-002** Pre-existing lint debt: apps/api (7 errors/3 warnings: \`no-explicit-any\`, unused vars) and apps/console (many errors incl. react-hooks/rules-of-hooks in orders/page.tsx = BUG-003).
- **OBS-003** During the run the API dev process exited silently once (no crash trace) and had to be restarted; cause unknown (not reproduced).
- **OBS-004** Login latency is high locally: 1–7 s per \`POST /auth/login\` (bcrypt cost 12 plus ~0.8 s round trip to the hosted Redis).
- **OBS-005** Dev-mode first request to each Next page triggers a compile (1–10 s) and occasionally one transient 404 on cold start (classified FLAKY, passes on retry).
- **OBS-006** Residue left by the run (cannot be hard-deleted through the API; verified in MySQL): 2 CANCELLED QA orders (stock released; seeded Northwind stock verified back at 1800 on-hand / 60 reserved), 3 soft-deleted QA products (+their inventory rows), 3 soft-deleted QA coupons in Lakeside. No live (non-deleted) QA product or coupon remains. Website content rows were removed again so the module is back to code defaults.
`;
fs.writeFileSync(path.join(out, 'BUG_REPORT.md'), md);
console.log(`BUG_REPORT.md written (${bugs.length} bugs)`);
