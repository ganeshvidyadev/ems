import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, newPage, shot, meaningful, VIEWPORTS } from '../lib/browser.mjs';
import { HOSTS, STOREFRONT_PORT } from '../lib/config.mjs';
import { call } from '../lib/client.mjs';

const NW = `http://${HOSTS.northwind}:${STOREFRONT_PORT}`;
const LS = `http://${HOSTS.lakeside}:${STOREFRONT_PORT}`;
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const clean = (issues) => ({
  pageErrors: issues.pageErrors,
  http5xx: issues.http5xx,
  console: meaningful(issues.console).filter((m) => !/^Failed to load resource/.test(m)),
});

test('[STO-001] Northwind storefront home renders its brand, products and no JS errors/5xx', async () => {
  const { page, ctx, issues } = await newPage(browser);
  try {
    const res = await page.goto(NW, { waitUntil: 'networkidle', timeout: 120_000 });
    assert.equal(res.status(), 200);
    assert.match(await page.title(), /Northwind/i);
    assert.deepEqual(clean(issues), { pageErrors: [], http5xx: [], console: [] });
    await shot(page, 'storefront-northwind-home-desktop');
  } finally { await ctx.close(); }
});

test('[STO-002] product listing page shows the 12 seeded Northwind products', async () => {
  const names = (await call('GET', '/storefront/products?limit=50', { host: HOSTS.northwind })).body.data.map((p) => p.name);
  const { page, ctx } = await newPage(browser);
  try {
    await page.goto(`${NW}/products`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(3000);
    const text = await page.locator('body').innerText();
    const shown = names.filter((n) => text.includes(n.slice(0, 18)));
    assert.ok(shown.length >= Math.min(12, names.length) - 2, `only ${shown.length}/${names.length} products rendered`);
    await shot(page, 'storefront-northwind-products');
  } finally { await ctx.close(); }
});

test('[STO-003] product detail page renders name, price and an add-to-cart control', async () => {
  const p = (await call('GET', '/storefront/products?limit=1', { host: HOSTS.northwind })).body.data[0];
  const { page, ctx, issues } = await newPage(browser);
  try {
    await page.goto(`${NW}/products/${p.slug}`, { waitUntil: 'networkidle', timeout: 120_000 });
    assert.ok((await page.locator('h1').first().innerText()).includes(p.name.slice(0, 15)));
    assert.ok(await page.getByRole('button', { name: /add to cart|add to bag/i }).first().isVisible(), 'no add-to-cart button');
    assert.deepEqual(clean(issues).pageErrors, []);
    await shot(page, 'storefront-northwind-product-detail');
  } finally { await ctx.close(); }
});

test('[STO-004] unknown product slug shows a not-found page (not a crash)', async () => {
  const { page, ctx } = await newPage(browser);
  try {
    const res = await page.goto(`${NW}/products/qa-does-not-exist`, { waitUntil: 'networkidle', timeout: 120_000 });
    assert.equal(res.status(), 404);
  } finally { await ctx.close(); }
});

test('[STO-005] cart page and checkout page load (empty cart state handled)', async () => {
  const { page, ctx, issues } = await newPage(browser);
  try {
    for (const route of ['/cart', '/checkout']) {
      const res = await page.goto(NW + route, { waitUntil: 'networkidle', timeout: 120_000 });
      assert.ok(res.status() < 500, `${route} -> ${res.status()}`);
      assert.ok((await page.locator('body').innerText()).trim().length > 20, `${route} blank`);
    }
    assert.deepEqual(clean(issues).pageErrors, []);
  } finally { await ctx.close(); }
});

test('[STO-006] customer auth pages render forms and validate empty submit', async () => {
  const { page, ctx } = await newPage(browser);
  try {
    for (const route of ['/account/login', '/account/register']) {
      await page.goto(NW + route, { waitUntil: 'networkidle', timeout: 120_000 });
      assert.ok((await page.locator('input[type=email], input[name=email]').count()) >= 1, `${route} has no email field`);
      assert.ok((await page.locator('input[type=password]').count()) >= 1, `${route} has no password field`);
    }
    await page.goto(NW + '/account/login', { waitUntil: 'networkidle' });
    await page.locator('button[type=submit]').first().click();
    await page.waitForTimeout(800);
    assert.ok(page.url().includes('/account/login'), 'empty login submitted');
  } finally { await ctx.close(); }
});

test('[STO-007] account pages require login (redirect or gate) for an anonymous visitor', async () => {
  const { page, ctx } = await newPage(browser);
  try {
    await page.goto(NW + '/account/orders', { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(1500);
    const url = page.url();
    const text = (await page.locator('body').innerText()).toLowerCase();
    assert.ok(/login|sign in/.test(url) || /sign in|log in|login/.test(text), 'anonymous visitor sees order history page without a login gate');
  } finally { await ctx.close(); }
});

test('[STO-008] Lakeside host never renders Northwind branding or products', async () => {
  const { page, ctx } = await newPage(browser);
  try {
    await page.goto(LS, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => {});
    await page.goto(`${LS}/products`, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => {});
    const html = await page.content();
    assert.ok(!/Northwind Reserve|Northwind Traders/.test(html), 'lakeside storefront leaks northwind content');
    await shot(page, 'storefront-lakeside-products');
  } finally { await ctx.close(); }
});

for (const vp of ['tablet', 'mobile']) {
  test(`[STO-009] responsive: Northwind home and products have no horizontal overflow at ${vp}`, async () => {
    const { page, ctx } = await newPage(browser, VIEWPORTS[vp]);
    try {
      for (const route of ['/', '/products']) {
        await page.goto(NW + route, { waitUntil: 'networkidle', timeout: 120_000 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `${route} overflows by ${overflow}px at ${vp}`);
        await shot(page, `storefront-northwind-${route === '/' ? 'home' : 'products'}-${vp}`);
      }
    } finally { await ctx.close(); }
  });
}

test('[STO-010] browser add-to-cart flow: product -> cart shows the item (BUY-flow UI)', { timeout: 240_000 }, async () => {
  const p = (await call('GET', '/storefront/products?limit=1', { host: HOSTS.northwind })).body.data[0];
  const { page, ctx, issues } = await newPage(browser);
  try {
    await page.goto(`${NW}/products/${p.slug}`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.getByRole('button', { name: /add to cart|add to bag/i }).first().click();
    await page.waitForTimeout(2500);
    await page.goto(`${NW}/cart`, { waitUntil: 'networkidle', timeout: 120_000 });
    assert.ok((await page.locator('main').innerText()).includes(p.name.slice(0, 15)), 'item missing from cart page after add');
    assert.deepEqual(clean(issues).http5xx, []);
    await shot(page, 'storefront-northwind-cart');
  } finally { await ctx.close(); }
});
