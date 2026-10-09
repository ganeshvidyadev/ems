import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, newPage, shot, meaningful, VIEWPORTS } from '../lib/browser.mjs';
import { CONSOLE, USERS, DEMO_PASSWORD } from '../lib/config.mjs';
import { call, login } from '../lib/client.mjs';
import { sql } from '../lib/db.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

async function uiLogin(page, email, password = DEMO_PASSWORD) {
  await page.goto(`${CONSOLE}/login`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
}
async function uiLoginOk(page, email) {
  await uiLogin(page, email);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

const SUPER_ADMIN_ROUTES = ['/analytics', '/alerts', '/platform-health', '/tenants', '/plans', '/billing', '/dunning', '/settlements', '/quota', '/support', '/queues', '/integrations', '/tenant-export', '/website', '/themes', '/theme-templates', '/seo', '/platform-staff', '/audit-log', '/logs', '/platform-settings'];
const COMPANY_ROUTES = ['/', '/orders', '/products', '/inventory', '/customers', '/coupons', '/gift-cards', '/shipments', '/returns', '/warehouses', '/cms', '/banners', '/menus', '/reviews', '/settings', '/domains', '/taxes', '/subscription'];

test('[CON-001] login page renders form; empty submit is blocked by validation', async () => {
  const { page, ctx } = await newPage(browser);
  try {
    await page.goto(`${CONSOLE}/login`, { waitUntil: 'networkidle', timeout: 90_000 });
    assert.ok(await page.locator('#email').isVisible());
    assert.ok(await page.locator('#password').isVisible());
    await page.click('button[type=submit]');
    await page.waitForTimeout(800);
    assert.ok(page.url().includes('/login'), 'left /login with empty form');
    assert.ok((await page.locator('[role=alert], .text-destructive').count()) > 0, 'no validation message shown');
  } finally { await ctx.close(); }
});

test('[CON-002] wrong password shows an error and does not authenticate', async () => {
  const { page, ctx } = await newPage(browser);
  try {
    await uiLogin(page, 'qa-nonexistent@example.invalid', 'Wrong-Password-1');
    await page.waitForTimeout(2500);
    assert.ok(page.url().includes('/login'));
    assert.ok((await page.locator('[role=alert]').count()) > 0, 'no error alert for bad credentials');
    await shot(page, 'console-login-error');
  } finally { await ctx.close(); }
});

test('[CON-003] protected route redirects an unauthenticated visitor to /login?next=', async () => {
  const { page, ctx } = await newPage(browser);
  try {
    await page.goto(`${CONSOLE}/tenants`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    assert.match(page.url(), /next=/);
  } finally { await ctx.close(); }
});

test('[CON-004] super admin lands in the Super Admin shell with the full platform nav', async () => {
  const { page, ctx } = await newPage(browser);
  try {
    await uiLoginOk(page, USERS.superAdmin);
    const hrefs = await page.locator('aside a, nav a').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    for (const r of ['/tenants', '/plans', '/website', '/platform-settings', '/audit-log']) assert.ok(hrefs.includes(r), `nav missing ${r}`);
    assert.ok(!hrefs.includes('/orders'), 'tenant-only nav leaked into super admin shell');
    await shot(page, 'console-superadmin-home');
  } finally { await ctx.close(); }
});

test('[CON-005] every super-admin page renders without JS errors or 5xx (4xx/blocked recorded to console-routes.json)', { timeout: 600_000 }, async () => {
  const { page, ctx, issues } = await newPage(browser);
  const rows = [];
  try {
    await uiLoginOk(page, USERS.superAdmin);
    for (const route of SUPER_ADMIN_ROUTES) {
      const before = { c: issues.console.length, e: issues.pageErrors.length, x5: issues.http5xx.length, x4: issues.http4xx.length };
      await page.goto(CONSOLE + route, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const body = (await page.locator('body').innerText()).slice(0, 4000);
      rows.push({
        route,
        crashed: /Application error|This page could not be found|Unhandled Runtime Error/i.test(body),
        pageErrors: issues.pageErrors.slice(before.e),
        http5xx: issues.http5xx.slice(before.x5),
        http4xx: issues.http4xx.slice(before.x4).filter((u) => !/auth\/refresh/.test(u)),
        emptyBody: body.trim().length < 20,
      });
      await shot(page, `console-sa${route.replace(/\//g, '-')}`);
    }
    fs.writeFileSync(path.resolve(import.meta.dirname, '../../qa-reports/console-routes.json'), JSON.stringify(rows, null, 2));
    const bad = rows.filter((r) => r.crashed || r.pageErrors.length || r.emptyBody);
    assert.deepEqual(bad.map((r) => r.route), [], `broken pages: ${JSON.stringify(bad)}`);
    const with5xx = rows.filter((r) => r.http5xx.length);
    assert.deepEqual(with5xx.map((r) => `${r.route}: ${r.http5xx.join(', ')}`), [], '5xx from API while rendering pages');
  } finally { await ctx.close(); }
});

test('[CON-006] Website module: 9 tabs; editing Hero in the UI saves, validates, persists, and reaches the public API', { timeout: 240_000 }, async () => {
  const admin = await login(USERS.superAdmin);
  const original = (await call('GET', '/platform/website', { token: admin })).body.data;
  const existing = new Set(sql('SELECT `key` FROM website_content').map((r) => r[0]));
  const { page, ctx } = await newPage(browser);
  const TAG = `UI-${Date.now().toString(36)}`;
  try {
    await uiLoginOk(page, USERS.superAdmin);
    await page.goto(`${CONSOLE}/website`, { waitUntil: 'networkidle', timeout: 90_000 });
    for (const tab of ['Hero', 'Features', 'Products', 'Plans', 'About', 'Careers', 'Contact', 'Header', 'Footer']) {
      assert.ok(await page.getByRole('button', { name: tab, exact: true }).isVisible(), `tab ${tab} missing`);
    }
    // valid edit
    await page.fill('#heroTitleHighlight', TAG);
    await page.getByRole('button', { name: 'Save hero section' }).click();
    await page.getByText('Website content updated.').waitFor({ timeout: 20_000 });
    assert.equal((await call('GET', '/website/content')).body.data.hero.titleHighlight, TAG);
    // persists across reload
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.inputValue('#heroTitleHighlight'), TAG, 'edit not preserved after refresh');
    // invalid edit: empty primary CTA label is rejected and an error is shown
    await page.fill('#heroPrimaryLabel', '');
    await page.getByRole('button', { name: 'Save hero section' }).click();
    await page.getByText('Could not save these changes').waitFor({ timeout: 20_000 });
    assert.equal((await call('GET', '/website/content')).body.data.hero.primaryCtaLabel, original.hero.primaryCtaLabel, 'invalid data was saved');
    await shot(page, 'console-website-validation-error');
    // other tabs render their forms
    await page.getByRole('button', { name: 'Footer', exact: true }).click();
    assert.ok(await page.locator('#footerEmail').isVisible(), 'footer email field missing');
    await page.getByRole('button', { name: 'Plans', exact: true }).click();
    assert.ok(await page.getByText('Pricing section').isVisible());
  } finally {
    await call('PUT', '/platform/website', { token: admin, body: original });
    for (const k of ['hero', 'features', 'header', 'footer', 'plans_display', 'about', 'products', 'career', 'contact']) if (!existing.has(k)) sql(`DELETE FROM website_content WHERE \`key\`='${k}'`);
    await ctx.close();
  }
});

test('[CON-007] Plans page lists the real plans from the API', async () => {
  const plans = (await call('GET', '/plans')).body.data;
  const { page, ctx } = await newPage(browser);
  try {
    await uiLoginOk(page, USERS.superAdmin);
    await page.goto(`${CONSOLE}/plans`, { waitUntil: 'networkidle', timeout: 90_000 });
    const text = await page.locator('main').innerText();
    for (const p of plans) assert.ok(text.includes(p.name), `plan ${p.name} missing`);
  } finally { await ctx.close(); }
});

test('[CON-008] merchant (Northwind owner) gets the company shell, never the platform nav', async () => {
  const { page, ctx } = await newPage(browser);
  try {
    await uiLoginOk(page, USERS.nwOwner);
    const hrefs = await page.locator('aside a, nav a').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    for (const r of ['/tenants', '/platform-settings', '/website', '/audit-log']) assert.ok(!hrefs.includes(r), `merchant nav exposes ${r}`);
    for (const r of ['/orders', '/products']) assert.ok(hrefs.includes(r), `merchant nav missing ${r}`);
    await shot(page, 'console-merchant-home');
  } finally { await ctx.close(); }
});

test('[CON-009] merchant typing a super-admin URL sees no platform data (API 403 enforced behind the UI)', async () => {
  const { page, ctx, issues } = await newPage(browser);
  try {
    await uiLoginOk(page, USERS.nwOwner);
    for (const route of ['/tenants', '/platform-settings', '/website', '/plans']) {
      await page.goto(CONSOLE + route, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const text = (await page.locator('body').innerText()).toLowerCase();
      assert.ok(!text.includes('lakeside'), `${route} exposes another tenant name`);
      assert.ok(!/maintenance mode|feature flags/.test(text) || route !== '/platform-settings', `${route} shows platform settings`);
    }
    const leaked = issues.http4xx.filter((u) => /\/platform\//.test(u) && !/^403/.test(u));
    assert.deepEqual(leaked, [], 'platform API calls from a merchant did not return 403');
  } finally { await ctx.close(); }
});

test('[CON-010] company pages render for the merchant without JS errors/5xx (results saved)', { timeout: 600_000 }, async () => {
  const { page, ctx, issues } = await newPage(browser);
  const rows = [];
  try {
    await uiLoginOk(page, USERS.nwOwner);
    for (const route of COMPANY_ROUTES) {
      const b = { e: issues.pageErrors.length, x5: issues.http5xx.length, x4: issues.http4xx.length };
      await page.goto(CONSOLE + route, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const body = (await page.locator('body').innerText()).slice(0, 4000);
      rows.push({ route, crashed: /Application error|could not be found|Unhandled Runtime Error/i.test(body), pageErrors: issues.pageErrors.slice(b.e), http5xx: issues.http5xx.slice(b.x5), http4xx: issues.http4xx.slice(b.x4).filter((u) => !/auth\/refresh/.test(u)) });
    }
    fs.writeFileSync(path.resolve(import.meta.dirname, '../../qa-reports/console-company-routes.json'), JSON.stringify(rows, null, 2));
    assert.deepEqual(rows.filter((r) => r.crashed || r.pageErrors.length || r.http5xx.length).map((r) => r.route), []);
  } finally { await ctx.close(); }
});

test('[CON-011] UI tenant isolation: Northwind products visible to Northwind owner, absent for Lakeside owner', async () => {
  const names = (await call('GET', '/console/products?limit=3', { token: await login(USERS.nwOwner) })).body.data.map((p) => p.name);
  const nw = await newPage(browser);
  const ls = await newPage(browser);
  try {
    await uiLoginOk(nw.page, USERS.nwOwner);
    await nw.page.goto(`${CONSOLE}/products`, { waitUntil: 'networkidle', timeout: 90_000 });
    await nw.page.getByText(names[0].slice(0, 20)).first().waitFor({ timeout: 30_000 });
    const nwText = await nw.page.locator('body').innerText();
    assert.ok(names.some((n) => nwText.includes(n.slice(0, 20))), 'northwind owner does not see own products');
    await uiLoginOk(ls.page, USERS.lsOwner);
    await ls.page.goto(`${CONSOLE}/products`, { waitUntil: 'networkidle', timeout: 90_000 });
    await ls.page.waitForTimeout(4000);
    const lsText = await ls.page.locator('body').innerText();
    for (const n of names) assert.ok(!lsText.includes(n.slice(0, 20)), `lakeside UI shows northwind product "${n}"`);
    await shot(ls.page, 'console-lakeside-products-empty');
  } finally { await nw.ctx.close(); await ls.ctx.close(); }
});

for (const vp of ['tablet', 'mobile']) {
  test(`[CON-012] responsive: login + super admin home usable at ${vp} (no horizontal overflow)`, async () => {
    const { page, ctx } = await newPage(browser, VIEWPORTS[vp]);
    try {
      await page.goto(`${CONSOLE}/login`, { waitUntil: 'networkidle', timeout: 90_000 });
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'login overflows');
      await shot(page, `console-login-${vp}`);
      await uiLoginOk(page, USERS.superAdmin);
      await page.waitForTimeout(1500);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `dashboard overflows at ${vp}`);
      await shot(page, `console-home-${vp}`);
    } finally { await ctx.close(); }
  });
}

test('[CON-013] logout from the UI ends the session and protected pages redirect again', async () => {
  const { page, ctx } = await newPage(browser);
  try {
    await uiLoginOk(page, USERS.lsOps);
    const logout = page.getByRole('button', { name: /sign out|log ?out/i }).first();
    if (!(await logout.count())) {
      await page.getByRole('button', { name: /account|profile|menu|user/i }).first().click().catch(() => {});
    }
    await page.getByText(/sign out|log ?out/i).first().click({ timeout: 10_000 });
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    await page.goto(`${CONSOLE}/products`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 30_000 });
  } finally { await ctx.close(); }
});
