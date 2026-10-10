// QA cycle 4: realistic seeded tenants (seed:realistic, commit b510ce5).
// Tenant isolation across the five seeded tenants, storefront and merchant workflows on
// seeded data, order lifecycle on seeded orders, and list-endpoint performance at ~200
// products / 150 orders per tenant.
//
// Writes (all reverted or QA-tagged, see after()):
//   - one COD order per workflow tenant (QA-<run> note), cancelled at the end (stock restocked;
//     a CANCELLED order row, its history/movements and an order-sequence increment remain);
//   - hold -> resume on ONE seeded CONFIRMED/PROCESSING order per workflow tenant (status returns
//     to the original value; two status-history rows and a version bump remain);
//   - nothing else. Cross-tenant write attempts are expected to be refused; if one ever succeeds
//     the test reverts it with the owning tenant's token before failing.
//
// Env: QA_API (default :4000), QA_SEED_ENGINE (path to realistic/db/engine.ts, used only to read the
// customer demo password default; never printed), QA_PERF_OUT (JSON file for timings).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { call, login, decodeJwt } from '../lib/client.mjs';
import { sql } from '../lib/db.mjs';

const RUN = Date.now().toString(36).toUpperCase();
const SLUGS = ['electrohub-india', 'styleverse-fashion', 'freshbasket-grocery', 'sportzone-india', 'decornest-home'];
const host = (slug) => `${slug}.ems.localhost`;
const rows = (r) => r.body?.data?.items ?? r.body?.data ?? [];
const one = (q) => sql(q)[0]?.[0];
const PERF_OUT = process.env.QA_PERF_OUT ?? path.join(os.tmpdir(), 'ems-qa-perf-seeded.json');
const ENGINE = process.env.QA_SEED_ENGINE ?? new URL('../../apps/api/src/database/seeds/realistic/db/engine.ts', import.meta.url);

function customerPassword() {
  if (process.env.SEED_CUSTOMER_PASSWORD) return process.env.SEED_CUSTOMER_PASSWORD;
  const src = fs.readFileSync(ENGINE, 'utf8');
  return /SEED_CUSTOMER_PASSWORD \?\? '([^']+)'/.exec(src)?.[1];
}

const T = {};
const createdOrders = [];
const heldSeeded = [];
const perf = { generatedAt: null, api: process.env.QA_API, endpoints: [], queryCounts: [], notes: {} };

async function timed(fn) {
  const t0 = performance.now();
  const r = await fn();
  return { r, ms: Math.round(performance.now() - t0) };
}
const questions = () => Number(sql("SHOW GLOBAL STATUS LIKE 'Questions'")[0][1]);

before(async () => {
  for (const slug of SLUGS) {
    const token = await login(`owner@${slug}.test`);
    const tid = one(`SELECT id FROM tenants WHERE slug='${slug}'`);
    const g = (p) => call('GET', p, { token });
    T[slug] = {
      tid,
      token,
      product: rows(await g('/console/products?limit=5'))[0],
      order: rows(await g('/console/orders?limit=5'))[0],
      customer: rows(await g('/console/customers?limit=5'))[0],
      coupon: rows(await g('/console/coupons?limit=5'))[0],
      warehouse: rows(await g('/console/warehouses'))[0],
      store: rows(await g('/console/stores'))[0],
    };
  }
});

after(async () => {
  for (const { slug, id } of heldSeeded) await call('POST', `/console/orders/${id}/resume`, { token: T[slug].token });
  for (const { slug, id } of createdOrders) await call('POST', `/console/orders/${id}/cancel`, { token: T[slug].token, body: { reason: `QA-${RUN} cleanup` } });
  perf.generatedAt = new Date().toISOString();
  fs.writeFileSync(PERF_OUT, JSON.stringify(perf, null, 2));
});

// ---------------------------------------------------------------------------
// Seed visibility through the API
// ---------------------------------------------------------------------------

test('[SEED-001] every seeded owner token carries its own tenant id (tid matches tenants.id for the slug)', () => {
  for (const slug of SLUGS) assert.equal(String(decodeJwt(T[slug].token).tid), String(T[slug].tid), slug);
  assert.equal(new Set(SLUGS.map((s) => decodeJwt(T[s].token).tid)).size, 5);
});

test('[SEED-002] console list totals equal the DB counts per seeded tenant (products, customers, orders)', async () => {
  for (const slug of SLUGS) {
    const { token, tid } = T[slug];
    for (const [p, q] of [
      ['/console/products?limit=1', `SELECT COUNT(*) FROM products WHERE tenant_id=${tid} AND deleted_at IS NULL`],
      ['/console/customers?limit=1', `SELECT COUNT(*) FROM customers WHERE tenant_id=${tid}`],
      ['/console/orders?limit=1', `SELECT COUNT(*) FROM orders WHERE tenant_id=${tid}`],
    ]) {
      const r = await call('GET', p, { token });
      assert.equal(r.status, 200, `${slug} ${p}`);
      assert.equal(r.body.meta.pagination.total, Number(one(q)), `${slug} ${p} total vs DB`);
    }
  }
});

test('[SEED-003] each storefront host resolves to its own store and lists only that tenant\'s products', async () => {
  for (const slug of SLUGS) {
    const s = await call('GET', '/storefront/store', { host: host(slug) });
    assert.equal(s.status, 200, slug);
    assert.equal(s.body.data.id, T[slug].store.id, `${slug} storefront store`);
    const r = await call('GET', '/storefront/products?limit=100', { host: host(slug) });
    assert.equal(r.status, 200);
    const own = new Set(sql(`SELECT public_id FROM products WHERE tenant_id=${T[slug].tid}`).map((x) => x[0]));
    for (const p of rows(r)) assert.ok(own.has(p.id), `${slug} storefront listed foreign product ${p.id}`);
    assert.ok(r.body.meta.pagination.total > 0 && r.body.meta.pagination.total <= 200, `${slug} total ${r.body.meta.pagination.total}`);
  }
});

// ---------------------------------------------------------------------------
// Tenant isolation across the five seeded tenants
// ---------------------------------------------------------------------------

test('[STI-001] list endpoints of every seeded tenant return only that tenant\'s rows (DB ownership check)', async () => {
  for (const slug of SLUGS) {
    const { token, tid } = T[slug];
    for (const [p, table] of [
      ['/console/products?limit=100', 'products'],
      ['/console/customers?limit=100', 'customers'],
      ['/console/orders?limit=100', 'orders'],
      ['/console/coupons?limit=100', 'coupons'],
      ['/console/reviews?limit=100', 'reviews'],
      ['/console/gift-cards?limit=100', 'gift_cards'],
      ['/console/returns?limit=100', 'returns'],
    ]) {
      const r = await call('GET', p, { token });
      assert.equal(r.status, 200, `${slug} ${p} -> ${r.status}`);
      const ids = rows(r).map((x) => x.id).filter(Boolean);
      if (ids.length === 0) continue;
      const list = ids.map((i) => `'${i}'`).join(',');
      assert.equal(Number(one(`SELECT COUNT(*) FROM \`${table}\` WHERE public_id IN (${list}) AND tenant_id<>${tid}`)), 0, `${slug} ${p} returned rows of another tenant`);
      assert.equal(Number(one(`SELECT COUNT(*) FROM \`${table}\` WHERE public_id IN (${list}) AND tenant_id=${tid}`)), ids.length, `${slug} ${p} returned ids that are not this tenant's`);
    }
  }
});

test('[STI-002] cross-tenant reads by id are 404 for all 20 ordered pairs of seeded tenants (product, order, customer, coupon)', async () => {
  const leaks = [];
  for (const a of SLUGS) {
    for (const b of SLUGS) {
      if (a === b) continue;
      for (const [p, rec] of [['products', T[b].product], ['orders', T[b].order], ['customers', T[b].customer], ['coupons', T[b].coupon]]) {
        const r = await call('GET', `/console/${p}/${rec.id}`, { token: T[a].token });
        if (r.status !== 404) leaks.push(`${a} -> ${b} ${p}/${rec.id}: ${r.status}`);
      }
    }
  }
  assert.deepEqual(leaks, []);
});

test('[STI-003] cross-tenant writes are refused and leave the victim rows untouched (electrohub -> 4 others)', async () => {
  const a = 'electrohub-india';
  const fp = (b) => sql(`SELECT
      (SELECT CONCAT_WS('|',name,version,updated_at) FROM products WHERE public_id='${T[b].product.id}'),
      (SELECT CONCAT_WS('|',status,version,updated_at) FROM orders WHERE public_id='${T[b].order.id}'),
      (SELECT CONCAT_WS('|',first_name,updated_at) FROM customers WHERE public_id='${T[b].customer.id}'),
      (SELECT CONCAT_WS('|',status,IFNULL(deleted_at,'-'),updated_at) FROM coupons WHERE public_id='${T[b].coupon.id}'),
      (SELECT COUNT(*) FROM inventory_movements WHERE tenant_id=${T[b].tid})`)[0].join('#');
  const problems = [];
  for (const b of SLUGS.filter((s) => s !== a)) {
    const before = fp(b);
    const tok = T[a].token;
    const attempts = [
      ['PUT', `/console/products/${T[b].product.id}`, { name: `QA-HACKED-${RUN}` }, () => call('PUT', `/console/products/${T[b].product.id}`, { token: T[b].token, body: { name: T[b].product.name } })],
      ['PUT', `/console/customers/${T[b].customer.id}`, { firstName: 'QAHACK' }, () => call('PUT', `/console/customers/${T[b].customer.id}`, { token: T[b].token, body: { firstName: T[b].customer.firstName } })],
      ['POST', `/console/orders/${T[b].order.id}/hold`, { reason: 'QA cross-tenant' }, () => call('POST', `/console/orders/${T[b].order.id}/resume`, { token: T[b].token })],
      ['POST', `/console/orders/${T[b].order.id}/cancel`, { reason: 'QA cross-tenant' }, null],
      ['PUT', `/console/coupons/${T[b].coupon.id}`, { name: 'QA-HACKED' }, null],
      ['DELETE', `/console/coupons/${T[b].coupon.id}`, undefined, null],
      ['POST', '/console/inventory/adjust', { warehouseId: T[b].warehouse.id, productId: T[b].product.id, quantityDelta: 1, type: 'ADJUSTMENT', reason: `QA-${RUN} cross-tenant` }, null],
    ];
    for (const [m, p, body, revert] of attempts) {
      const r = await call(m, p, { token: tok, body });
      if (![404, 400, 422].includes(r.status)) {
        problems.push(`${a} ${m} ${p} (owned by ${b}) -> ${r.status}`);
        if (revert) await revert();
      }
    }
    if (before !== fp(b)) problems.push(`${b} rows changed after cross-tenant attempts`);
  }
  assert.deepEqual(problems, []);
});

test('[STI-004] non-owner staff are confined to their tenant (ORDER_MANAGER, INVENTORY_MANAGER, PRODUCT_MANAGER)', async () => {
  const om = await login('tanuja.pawar@electrohub-india.test');
  const im = await login('hetal.vora@styleverse-fashion.test');
  const pm = await login('meenakshi.rao@freshbasket-grocery.test');
  assert.equal(String(decodeJwt(om).tid), String(T['electrohub-india'].tid));
  assert.equal((await call('GET', `/console/orders/${T['electrohub-india'].order.id}`, { token: om })).status, 200);
  const bad = [];
  for (const b of ['styleverse-fashion', 'freshbasket-grocery', 'decornest-home']) {
    const r = await call('GET', `/console/orders/${T[b].order.id}`, { token: om });
    if (r.status !== 404) bad.push(`OM electrohub -> ${b} order ${r.status}`);
  }
  const before = one(`SELECT COUNT(*) FROM inventory_movements WHERE tenant_id=${T['electrohub-india'].tid}`);
  const adj = await call('POST', '/console/inventory/adjust', { token: im, body: { warehouseId: T['electrohub-india'].warehouse.id, productId: T['electrohub-india'].product.id, quantityDelta: 1, type: 'ADJUSTMENT', reason: `QA-${RUN}` } });
  if (![404, 400, 422].includes(adj.status)) bad.push(`IM styleverse adjusted electrohub stock -> ${adj.status}`);
  if (one(`SELECT COUNT(*) FROM inventory_movements WHERE tenant_id=${T['electrohub-india'].tid}`) !== before) bad.push('electrohub ledger changed');
  const put = await call('PUT', `/console/products/${T['sportzone-india'].product.id}`, { token: pm, body: { name: 'QA-HACKED' } });
  if (put.status !== 404) {
    bad.push(`PM freshbasket -> sportzone product PUT ${put.status}`);
    await call('PUT', `/console/products/${T['sportzone-india'].product.id}`, { token: T['sportzone-india'].token, body: { name: T['sportzone-india'].product.name } });
  }
  assert.deepEqual(bad, []);
});

test('[STI-005] header / query tenant switching does not change the authenticated tenant', async () => {
  const a = T['decornest-home'];
  const b = T['electrohub-india'];
  const own = new Set(sql(`SELECT public_id FROM orders WHERE tenant_id=${a.tid}`).map((x) => x[0]));
  for (const extra of [
    { headers: { 'x-ems-hostname': host('electrohub-india') } },
    { headers: { 'x-tenant-id': String(b.tid) } },
    { headers: { 'x-tenant-id': decodeJwt(b.token).tid } },
    { path: `&tenantId=${b.tid}` },
    { path: `&storeId=${b.store.id}` },
  ]) {
    const r = await call('GET', `/console/orders?limit=100${extra.path ?? ''}`, { token: a.token, headers: extra.headers });
    assert.ok(r.status === 200 || (r.status >= 400 && r.status < 500), `status ${r.status}`);
    if (r.status === 200) for (const o of rows(r)) assert.ok(own.has(o.id), `foreign order ${o.id} via ${JSON.stringify(extra)}`);
  }
});

test('[STI-006] storefront host isolation: foreign product slug, foreign cart, foreign product in cart, foreign storeId', async () => {
  const A = 'freshbasket-grocery';
  const B = 'sportzone-india';
  const bProduct = rows(await call('GET', '/storefront/products?limit=1', { host: host(B) }))[0];
  assert.equal((await call('GET', `/storefront/products/${bProduct.slug}`, { host: host(B) })).status, 200);
  assert.equal((await call('GET', `/storefront/products/${bProduct.slug}`, { host: host(A) })).status, 404, 'B product visible on A host');
  const cart = await call('POST', `/storefront/cart?storeId=${T[A].store.id}`, { host: host(A) });
  const cartId = cart.body.data.id ?? cart.body.data.cartId;
  const read = await call('GET', `/storefront/cart/${cartId}`, { host: host(B) });
  assert.ok(read.status >= 400 && read.status < 500, `A cart readable via B host (${read.status})`);
  const add = await call('POST', `/storefront/cart/${cartId}/items?storeId=${T[A].store.id}`, { host: host(A), body: { productId: bProduct.id, quantity: 1 } });
  assert.ok(add.status >= 400 && add.status < 500, `B product added to A cart (${add.status})`);
  const mixed = await call('POST', `/storefront/cart?storeId=${T[A].store.id}`, { host: host(B) });
  perf.notes.crossStoreCart = { status: mixed.status, data: mixed.body?.data ?? mixed.body?.error };
  assert.ok(mixed.status >= 400 && mixed.status < 500, `cart for A's storeId created via B host (${mixed.status} ${JSON.stringify(mixed.body?.data)?.slice(0, 160)})`);
});

test('[STI-007] seeded coupon and gift card of one tenant are not usable on another tenant', async () => {
  const A = 'electrohub-india';
  const B = 'decornest-home';
  const gc = await call('POST', '/storefront/gift-cards/check-balance', { host: host(A), body: { code: 'EHIA-DD55-A066' } });
  assert.ok([200, 201].includes(gc.status), `own gift card -> ${gc.status}`);
  assert.ok(gc.body.data.valid !== false, `seeded ElectroHub gift card should be valid on its own host: ${JSON.stringify(gc.body.data)}`);
  const gcX = await call('POST', '/storefront/gift-cards/check-balance', { host: host(B), body: { code: 'EHIA-DD55-A066' } });
  assert.ok(gcX.status >= 400 || gcX.body?.data?.valid === false, `ElectroHub gift card accepted on DecorNest (${gcX.status} ${JSON.stringify(gcX.body?.data)})`);
  const p = rows(await call('GET', '/storefront/products?limit=1&sort=-priceMinor', { host: host(B) }))[0];
  const c = await call('POST', `/storefront/cart?storeId=${T[B].store.id}`, { host: host(B) });
  const cartId = c.body.data.id ?? c.body.data.cartId;
  await call('POST', `/storefront/cart/${cartId}/items?storeId=${T[B].store.id}`, { host: host(B), body: { productId: p.id, quantity: 1 } });
  const cp = await call('POST', `/storefront/cart/${cartId}/coupon?storeId=${T[B].store.id}`, { host: host(B), body: { code: 'EHWELCOME10' } });
  assert.ok(cp.status >= 400 && cp.status < 500, `ElectroHub coupon applied on DecorNest cart (${cp.status})`);
});

test('[STI-008] seeded customer accounts are tenant-scoped (login on own host only; token useless on another host)', async () => {
  const pw = customerPassword();
  assert.ok(pw, 'customer demo password not found in seeder defaults');
  const A = 'styleverse-fashion';
  const B = 'freshbasket-grocery';
  const email = one(`SELECT c.email FROM customers c WHERE c.tenant_id=${T[A].tid} AND c.status='ACTIVE' AND c.password_hash IS NOT NULL AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.id) ORDER BY c.id LIMIT 1`);
  assert.ok(email, 'precondition: an active seeded customer with orders');
  const ok = await call('POST', '/storefront/auth/login', { host: host(A), body: { email, password: pw } });
  assert.equal(ok.status, 200, `own-host customer login -> ${ok.status} ${JSON.stringify(ok.body?.error)}`);
  const tok = ok.body.data.accessToken;
  const mine = await call('GET', '/storefront/account/orders?limit=50', { host: host(A), token: tok });
  assert.equal(mine.status, 200);
  const ownOrders = new Set(sql(`SELECT o.public_id FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.email='${email}' AND o.tenant_id=${T[A].tid}`).map((x) => x[0]));
  assert.ok(rows(mine).length > 0, 'customer sees no orders');
  for (const o of rows(mine)) assert.ok(ownOrders.has(o.id), `customer saw an order that is not theirs: ${o.id}`);
  const x = await call('POST', '/storefront/auth/login', { host: host(B), body: { email, password: pw } });
  assert.ok([400, 401, 404].includes(x.status), `cross-host customer login -> ${x.status}`);
  const y = await call('GET', '/storefront/account/orders', { host: host(B), token: tok });
  assert.ok([401, 403, 404].includes(y.status), `A customer token accepted on B host (${y.status} rows=${rows(y).length})`);
  const otherOrder = one(`SELECT o.public_id FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.tenant_id=${T[A].tid} AND c.email<>'${email}' LIMIT 1`);
  const z = await call('GET', `/storefront/account/orders/${otherOrder}`, { host: host(A), token: tok });
  assert.equal(z.status, 404, `customer can read another customer's order (${z.status})`);
});

// ---------------------------------------------------------------------------
// Storefront workflows on seeded data (two tenants: same-state CGST/SGST and inter-state IGST)
// ---------------------------------------------------------------------------

const WF = [
  { slug: 'electrohub-india', address: { recipientName: 'QA Tester', phone: '+919876543210', addressLine1: '1 QA Street', city: 'Pune', stateCode: 'MH', stateName: 'Maharashtra', postalCode: '411001', countryCode: 'IN' }, intra: true, search: 'mouse', coupon: 'EHSAVE15', expired: 'EHINDEP15' },
  { slug: 'freshbasket-grocery', address: { recipientName: 'QA Tester', phone: '+919876543210', addressLine1: '1 QA Street', city: 'Chennai', stateCode: 'TN', stateName: 'Tamil Nadu', postalCode: '600001', countryCode: 'IN' }, intra: false, search: 'rice', coupon: 'FBSAVE15', expired: 'FBINDEP15' },
];
const stockOf = (publicId) => sql(`SELECT COALESCE(SUM(quantity_on_hand),0), COALESCE(SUM(quantity_reserved),0) FROM inventory_levels il JOIN products p ON p.id=il.product_id WHERE p.public_id='${publicId}' AND il.variant_id IS NULL`)[0].map(Number);

for (const wf of WF) {
  const H = host(wf.slug);
  const ctx = {};
  perf.notes[wf.slug] = ctx;

  test(`[SWF-001] ${wf.slug}: browse - pagination, sort by price, search, category tree, brands, detail`, async () => {
    const p1 = await call('GET', '/storefront/products?limit=24&page=1', { host: H });
    const p2 = await call('GET', '/storefront/products?limit=24&page=2', { host: H });
    assert.equal(p1.status, 200);
    assert.equal(p1.body.meta.pagination.limit, 24);
    const ids1 = new Set(rows(p1).map((x) => x.id));
    for (const x of rows(p2)) assert.ok(!ids1.has(x.id), 'page 2 repeats page 1');
    const asc = rows(await call('GET', '/storefront/products?limit=50&sort=priceMinor', { host: H })).map((x) => Number(x.priceMinor));
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b), 'sort=priceMinor not ascending');
    const desc = rows(await call('GET', '/storefront/products?limit=50&sort=-priceMinor', { host: H })).map((x) => Number(x.priceMinor));
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a), 'sort=-priceMinor not descending');
    const s = await call('GET', `/storefront/products?q=${wf.search}&limit=50`, { host: H });
    assert.equal(s.status, 200);
    ctx.searchTotal = s.body.meta.pagination.total;
    assert.ok(rows(s).length > 0 && s.body.meta.pagination.total < p1.body.meta.pagination.total, `search '${wf.search}' did not narrow (${s.body.meta.pagination.total})`);
    for (const x of rows(s)) assert.ok(JSON.stringify([x.name, x.shortDescription, x.description, x.sku, x.slug, x.metaKeywords, x.tags]).toLowerCase().includes(wf.search), `search hit '${x.name}' does not mention '${wf.search}'`);
    const tree = await call('GET', '/storefront/categories/tree', { host: H });
    assert.equal(tree.status, 200);
    assert.ok(rows(tree).length >= 5, 'category tree too small');
    assert.equal((await call('GET', '/storefront/brands', { host: H })).status, 200);
    const d = await call('GET', `/storefront/products/${rows(p1)[0].slug}`, { host: H });
    assert.equal(d.status, 200);
    assert.equal(d.body.data.id, rows(p1)[0].id);
  });

  test(`[SWF-002] ${wf.slug}: cart + pricing with GST (${wf.intra ? 'CGST+SGST' : 'IGST'}) + valid/expired coupon`, async () => {
    const list = rows(await call('GET', '/storefront/products?limit=100&type=SIMPLE', { host: H }));
    const ids = list.filter((p) => p.type === 'SIMPLE').map((p) => `'${p.id}'`).join(',');
    const pick = one(`SELECT p.public_id FROM products p JOIN inventory_levels il ON il.product_id=p.id AND il.variant_id IS NULL WHERE p.public_id IN (${ids}) GROUP BY p.id, p.price_minor HAVING SUM(il.quantity_on_hand-il.quantity_reserved) >= 10 ORDER BY p.price_minor DESC LIMIT 1`);
    assert.ok(pick, 'precondition: an in-stock SIMPLE product');
    ctx.product = list.find((p) => p.id === pick);
    ctx.productName = ctx.product.name;
    ctx.stockBefore = stockOf(pick);
    const c = await call('POST', `/storefront/cart?storeId=${T[wf.slug].store.id}`, { host: H });
    ctx.cartId = c.body.data.id ?? c.body.data.cartId;
    // Quantity large enough to meet the coupon's minimum order (seeded coupons carry min_order_minor).
    const minOrder = Number(one(`SELECT COALESCE(min_order_minor,0) FROM coupons WHERE tenant_id=${T[wf.slug].tid} AND code='${wf.coupon}'`) ?? 0);
    ctx.qty = Math.min(9, Math.max(2, Math.ceil((minOrder + 1) / Number(ctx.product.priceMinor))));
    const add = await call('POST', `/storefront/cart/${ctx.cartId}/items?storeId=${T[wf.slug].store.id}`, { host: H, body: { productId: pick, quantity: ctx.qty } });
    assert.ok([200, 201].includes(add.status), `add -> ${add.status} ${JSON.stringify(add.body?.error)}`);
    const pr = await call('POST', '/storefront/checkout/pricing', { host: H, body: { cartId: ctx.cartId, shippingAddress: wf.address, shippingMethod: 'STANDARD', paymentGateway: 'cod' } });
    assert.ok([200, 201].includes(pr.status), JSON.stringify(pr.body?.error));
    const d = pr.body.data;
    const n = (m) => BigInt(m?.amountMinor ?? 0);
    assert.equal(n(d.subtotal), BigInt(ctx.product.priceMinor) * BigInt(ctx.qty));
    assert.equal(n(d.total), n(d.subtotal) - n(d.discount) + n(d.shipping) + n(d.tax) + n(d.codFee), 'total != components');
    ctx.pricing = { subtotal: d.subtotal.amountMinor, tax: d.tax.amountMinor, shipping: d.shipping.amountMinor, codFee: d.codFee?.amountMinor, total: d.total.amountMinor };
    const line = d.lines?.[0] ?? d.items?.[0];
    const names = JSON.stringify(line?.taxBreakup ?? d.taxBreakup ?? '');
    ctx.taxBreakup = names;
    if (names.length > 4) assert.ok(wf.intra ? /CGST/.test(names) && /SGST/.test(names) : /IGST/.test(names), `unexpected tax breakup ${names}`);
    const ex = await call('POST', `/storefront/cart/${ctx.cartId}/coupon?storeId=${T[wf.slug].store.id}`, { host: H, body: { code: wf.expired } });
    assert.ok(ex.status >= 400 && ex.status < 500, `expired coupon ${wf.expired} accepted (${ex.status})`);
    const ok = await call('POST', `/storefront/cart/${ctx.cartId}/coupon?storeId=${T[wf.slug].store.id}`, { host: H, body: { code: wf.coupon } });
    ctx.couponStatus = ok.status;
    assert.ok([200, 201].includes(ok.status), `valid coupon ${wf.coupon} rejected (${ok.status} ${JSON.stringify(ok.body?.error)})`);
    const pr2 = (await call('POST', '/storefront/checkout/pricing', { host: H, body: { cartId: ctx.cartId, shippingAddress: wf.address, shippingMethod: 'STANDARD', paymentGateway: 'cod' } })).body.data;
    ctx.pricingWithCoupon = { subtotal: pr2.subtotal.amountMinor, discount: pr2.discount.amountMinor, tax: pr2.tax.amountMinor, taxWithoutCoupon: d.tax.amountMinor };
    await call('DELETE', `/storefront/cart/${ctx.cartId}/coupon?storeId=${T[wf.slug].store.id}`, { host: H });
    assert.ok(n(pr2.discount) > 0n, 'valid coupon gave no discount');
  });

  test(`[SWF-003] ${wf.slug}: COD checkout on a seeded product, idempotent replay, stock committed, merchant-only visibility`, async () => {
    assert.ok(ctx.cartId, 'precondition: cart');
    const key = randomUUID();
    const body = { cartId: ctx.cartId, shippingAddress: wf.address, shippingMethod: 'STANDARD', paymentGateway: 'cod', email: `qa+${RUN.toLowerCase()}@example.invalid`, customerNote: `QA-${RUN}` };
    const { r, ms } = await timed(() => call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': key }, body }));
    ctx.placeOrderMs = ms;
    assert.ok([200, 201].includes(r.status), `place order -> ${r.status} ${JSON.stringify(r.body?.error)}`);
    ctx.orderId = r.body.data.orderId;
    ctx.orderNumber = r.body.data.orderNumber;
    createdOrders.push({ slug: wf.slug, id: ctx.orderId });
    const dup = await call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': key }, body });
    assert.equal(dup.body?.data?.orderId, ctx.orderId, 'replay created a different order');
    assert.equal(Number(one(`SELECT COUNT(*) FROM orders WHERE customer_note='QA-${RUN}' AND tenant_id=${T[wf.slug].tid}`)), 1);
    const [oh, rs] = stockOf(ctx.product.id);
    assert.ok(oh < ctx.stockBefore[0] || rs > ctx.stockBefore[1], 'stock did not move');
    const num = Number(one(`SELECT CAST(SUBSTRING(order_number,5) AS UNSIGNED) FROM orders WHERE public_id='${ctx.orderId}'`));
    assert.ok(num >= 151, `order number ${num} collides with the seeded range`);
    assert.ok(Number(one(`SELECT last_number FROM order_sequences WHERE tenant_id=${T[wf.slug].tid}`)) >= num);
    const db = sql(`SELECT subtotal_minor,discount_minor,shipping_minor,tax_minor,cod_fee_minor,round_off_minor,total_minor FROM orders WHERE public_id='${ctx.orderId}'`)[0].map(Number);
    assert.equal(db[6], db[0] - db[1] + db[2] + db[3] + db[4] + db[5], 'stored order totals do not reconcile');
    assert.equal((await call('GET', `/console/orders/${ctx.orderId}`, { token: T[wf.slug].token })).status, 200);
    const other = SLUGS.find((s) => s !== wf.slug);
    assert.equal((await call('GET', `/console/orders/${ctx.orderId}`, { token: T[other].token })).status, 404);
  });

  test(`[SWF-004] ${wf.slug}: QA order lifecycle hold -> resume -> cancel restores stock`, async () => {
    assert.ok(ctx.orderId, 'precondition: order');
    const tok = T[wf.slug].token;
    const h = await call('POST', `/console/orders/${ctx.orderId}/hold`, { token: tok, body: { reason: `QA-${RUN}` } });
    assert.ok([200, 201].includes(h.status), `hold -> ${h.status} ${JSON.stringify(h.body?.error)}`);
    assert.equal(one(`SELECT status FROM orders WHERE public_id='${ctx.orderId}'`), 'ON_HOLD');
    const rsm = await call('POST', `/console/orders/${ctx.orderId}/resume`, { token: tok });
    assert.ok([200, 201].includes(rsm.status), `resume -> ${rsm.status}`);
    const c = await call('POST', `/console/orders/${ctx.orderId}/cancel`, { token: tok, body: { reason: `QA-${RUN} cleanup` } });
    assert.ok([200, 201].includes(c.status), `cancel -> ${c.status} ${JSON.stringify(c.body?.error)}`);
    createdOrders.splice(createdOrders.findIndex((o) => o.id === ctx.orderId), 1);
    assert.deepEqual(stockOf(ctx.product.id), ctx.stockBefore, 'stock not restored after cancel');
  });

  test(`[SWF-005] ${wf.slug}: merchant console data views on seeded data (order detail, inventory, movements, low-stock, reviews, returns, dashboard summary)`, async () => {
    const tok = T[wf.slug].token;
    const tid = T[wf.slug].tid;
    const o = await call('GET', `/console/orders/${T[wf.slug].order.id}`, { token: tok });
    assert.equal(o.status, 200);
    const db = sql(`SELECT total_minor, (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) FROM orders o WHERE public_id='${T[wf.slug].order.id}'`)[0];
    assert.equal(o.body.data.total.amountMinor, db[0]);
    assert.equal(o.body.data.items.length, Number(db[1]));
    // A SIMPLE product: its stock slot is variant-less, so ?productId alone addresses it.
    const simple = one(`SELECT p.public_id FROM products p WHERE p.tenant_id=${tid} AND p.type='SIMPLE' AND p.deleted_at IS NULL AND EXISTS (SELECT 1 FROM inventory_movements m WHERE m.product_id=p.id) ORDER BY p.id LIMIT 1`);
    const lv = await call('GET', `/console/inventory/levels?productId=${simple}`, { token: tok });
    ctx.inventoryLevelsStatus = lv.status;
    assert.equal(lv.status, 200, `inventory levels -> ${lv.status} ${JSON.stringify(lv.body?.error)}`);
    assert.ok(rows(lv).length >= 1, 'no stock levels for a seeded SIMPLE product');
    const mv = await call('GET', `/console/inventory/movements/${simple}`, { token: tok });
    assert.equal(mv.status, 200);
    assert.ok(rows(mv).length >= 1, 'no movements for a seeded product');
    assert.equal((await call('GET', '/console/inventory/low-stock', { token: tok })).status, 200);
    for (const p of ['/console/reviews?limit=20', '/console/returns?limit=20', '/console/gift-cards?limit=20', '/console/coupons?limit=20', '/console/warehouses']) {
      assert.equal((await call('GET', p, { token: tok })).status, 200, p);
    }
    const rev = await call('GET', '/console/reviews?limit=1', { token: tok });
    assert.equal(rev.body.meta?.pagination?.total ?? rows(rev).length, Number(one(`SELECT COUNT(*) FROM reviews WHERE tenant_id=${tid}`)));
    const sum = await call('GET', `/console/reports/sales-summary?from=2026-04-14&to=2026-10-10&storeId=${T[wf.slug].store.id}`, { token: tok });
    assert.equal(sum.status, 200, `sales-summary -> ${sum.status} ${JSON.stringify(sum.body?.error)}`);
    ctx.salesSummary = JSON.stringify(sum.body.data).slice(0, 500);
    // The console dashboard always sends the store's public id (useSalesSummary({storeId: store.id})).
    const unfiltered = await call('GET', '/console/reports/sales-summary?from=2026-04-14&to=2026-10-10', { token: tok });
    ctx.salesSummaryUnfilteredOrders = unfiltered.body?.data?.ordersCount;
    assert.ok(Number(sum.body.data.ordersCount) > 0, `dashboard sales summary with storeId=<public id> reports ordersCount=${sum.body.data.ordersCount} (without storeId: ${unfiltered.body?.data?.ordersCount})`);
  });

  test(`[SWF-006] ${wf.slug}: order lifecycle rules on seeded orders (invalid transitions refused; hold/resume round-trip)`, async () => {
    const tok = T[wf.slug].token;
    const tid = T[wf.slug].tid;
    const byStatus = (s) => one(`SELECT public_id FROM orders WHERE tenant_id=${tid} AND status='${s}' AND (customer_note IS NULL OR customer_note NOT LIKE 'QA-%') ORDER BY id LIMIT 1`);
    const snap = (id) => one(`SELECT CONCAT_WS('|',status,payment_status,version) FROM orders WHERE public_id='${id}'`);
    const refused = [];
    const results = [];
    for (const [status, action] of [['DELIVERED', 'cancel'], ['COMPLETED', 'cancel'], ['CANCELLED', 'fulfil'], ['CANCELLED', 'hold'], ['DELIVERED', 'resume'], ['PENDING', 'close'], ['COMPLETED', 'hold'], ['RETURNED', 'cancel']]) {
      const id = byStatus(status);
      if (!id) continue;
      const before = snap(id);
      let body;
      if (action === 'fulfil') {
        const items = (await call('GET', `/console/orders/${id}`, { token: tok })).body.data.items;
        body = { items: items.map((i) => ({ orderItemId: String(i.id), quantity: i.quantity })) };
      } else if (action === 'cancel' || action === 'hold') body = { reason: `QA-${RUN} negative` };
      const r = await call('POST', `/console/orders/${id}/${action}`, { token: tok, body });
      results.push(`${action}@${status}=${r.status}:${r.body?.error?.code ?? ''}`);
      if (!(r.status >= 400 && r.status < 500)) refused.push(`${action} on ${status} -> ${r.status}`);
      if (snap(id) !== before) refused.push(`${action} on ${status} changed the order`);
    }
    ctx.invalidTransitions = results;
    assert.deepEqual(refused, []);
    const target = one(`SELECT public_id FROM orders WHERE tenant_id=${tid} AND status IN ('CONFIRMED','PROCESSING') AND (customer_note IS NULL OR customer_note NOT LIKE 'QA-%') ORDER BY id LIMIT 1`);
    const from = one(`SELECT status FROM orders WHERE public_id='${target}'`);
    const h = await call('POST', `/console/orders/${target}/hold`, { token: tok, body: { reason: `QA-${RUN} lifecycle check` } });
    assert.ok([200, 201].includes(h.status), `hold seeded ${from} order -> ${h.status} ${JSON.stringify(h.body?.error)}`);
    heldSeeded.push({ slug: wf.slug, id: target, from });
    const r = await call('POST', `/console/orders/${target}/resume`, { token: tok });
    assert.ok([200, 201].includes(r.status), `resume -> ${r.status}`);
    heldSeeded.pop();
    assert.equal(one(`SELECT status FROM orders WHERE public_id='${target}'`), from, 'resume did not restore the prior status');
    ctx.lifecycleTarget = `${one(`SELECT order_number FROM orders WHERE public_id='${target}'`)} (${from})`;
  });
}

test('[SWF-007] styleverse-fashion: VARIABLE product detail exposes variants; variant can be carted, bare product cannot', async () => {
  const H = host('styleverse-fashion');
  const list = rows(await call('GET', '/storefront/products?limit=100&type=VARIABLE', { host: H })).filter((p) => p.type === 'VARIABLE');
  assert.ok(list.length > 0, 'no VARIABLE products listed');
  const d = await call('GET', `/storefront/products/${list[0].slug}`, { host: H });
  assert.equal(d.status, 200);
  const variants = d.body.data.variants ?? [];
  assert.ok(variants.length >= 2, `variants: ${variants.length}`);
  const c = await call('POST', `/storefront/cart?storeId=${T['styleverse-fashion'].store.id}`, { host: H });
  const cartId = c.body.data.id ?? c.body.data.cartId;
  const inStock = one(`SELECT v.public_id FROM product_variants v JOIN inventory_levels il ON il.variant_id=v.id JOIN products p ON p.id=v.product_id WHERE p.public_id='${list[0].id}' GROUP BY v.id, v.public_id HAVING SUM(il.quantity_on_hand-il.quantity_reserved)>0 LIMIT 1`);
  assert.ok(inStock, 'precondition: a variant in stock');
  const add = await call('POST', `/storefront/cart/${cartId}/items?storeId=${T['styleverse-fashion'].store.id}`, { host: H, body: { productId: list[0].id, variantId: inStock, quantity: 1 } });
  assert.ok([200, 201].includes(add.status), `add variant -> ${add.status} ${JSON.stringify(add.body?.error)}`);
  const noVar = await call('POST', `/storefront/cart/${cartId}/items?storeId=${T['styleverse-fashion'].store.id}`, { host: H, body: { productId: list[0].id, quantity: 1 } });
  perf.notes.variableWithoutVariant = { status: noVar.status, error: noVar.body?.error?.code };
  assert.ok(noVar.status >= 400 && noVar.status < 500, `VARIABLE product added without a variant (${noVar.status})`);
});

test('[SWF-008] order customerId is a usable public id (order -> customer link and ?customerId filter)', async () => {
  const { token, tid } = T['electrohub-india'];
  const o = rows(await call('GET', '/console/orders?limit=5', { token })).find((x) => x.customerId);
  assert.ok(o, 'precondition: an order with a customer');
  const pub = one(`SELECT c.public_id FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.public_id='${o.id}'`);
  const r = await call('GET', `/console/customers/${o.customerId}`, { token });
  const f = await call('GET', `/console/orders?customerId=${pub}&limit=50`, { token });
  const expected = Number(one(`SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.public_id='${pub}' AND o.tenant_id=${tid}`));
  perf.notes.customerIdLink = { orderCustomerId: o.customerId, customerPublicId: pub, getCustomerByOrderCustomerId: r.status, filterStatus: f.status, filterTotal: f.body?.meta?.pagination?.total, expected };
  assert.equal(o.customerId, pub, `order.customerId is '${o.customerId}' (internal id) instead of the customer's public id; GET /console/customers/${o.customerId} -> ${r.status}`);
  assert.equal(r.status, 200);
  assert.equal(f.body?.meta?.pagination?.total, expected, `?customerId filter returned ${f.status} total=${f.body?.meta?.pagination?.total}`);
});

// ---------------------------------------------------------------------------
// Performance at seeded scale
// ---------------------------------------------------------------------------

test('[PERF-001] list endpoints respond within budget at seeded scale (median of 3, budget 3000 ms on this 8 GB dev box)', async () => {
  const slug = 'styleverse-fashion';
  const { token, store } = T[slug];
  const H = host(slug);
  const slugOf = rows(await call('GET', '/storefront/products?limit=1', { host: H }))[0].slug;
  const eps = [
    ['console', '/console/products?limit=20'],
    ['console', '/console/products?limit=100'],
    ['console', '/console/orders?limit=20'],
    ['console', '/console/orders?limit=100'],
    ['console', '/console/orders?limit=20&page=8'],
    ['console', '/console/customers?limit=100'],
    ['console', '/console/reviews?limit=100'],
    ['console', '/console/returns?limit=100'],
    ['console', '/console/coupons?limit=100'],
    ['console', '/console/gift-cards?limit=100'],
    ['console', '/console/inventory/low-stock'],
    ['console', `/console/reports/sales-summary?from=2026-04-14&to=2026-10-10&storeId=${store.id}`],
    ['storefront', '/storefront/products?limit=24'],
    ['storefront', '/storefront/products?limit=100'],
    ['storefront', '/storefront/products?q=shirt&limit=24'],
    ['storefront', '/storefront/products?sort=-priceMinor&limit=24'],
    ['storefront', '/storefront/categories/tree'],
    ['storefront', `/storefront/products/${slugOf}`],
  ];
  const slow = [];
  for (const [kind, p] of eps) {
    const ms = [];
    const serverMs = [];
    let status;
    let bytes = 0;
    for (let i = 0; i < 3; i++) {
      const { r, ms: t } = await timed(() => call('GET', p, kind === 'console' ? { token } : { host: H }));
      status = r.status;
      bytes = r.text.length;
      ms.push(t);
      serverMs.push(r.body?.meta?.durationMs ?? null);
    }
    ms.sort((a, b) => a - b);
    perf.endpoints.push({ tenant: slug, endpoint: p, status, medianMs: ms[1], minMs: ms[0], maxMs: ms[2], serverDurationMs: serverMs, responseBytes: bytes });
    if (status !== 200) slow.push(`${p} -> ${status}`);
    else if (ms[1] > 3000) slow.push(`${p} median ${ms[1]} ms`);
  }
  assert.deepEqual(slow, []);
});

test('[PERF-002] page size is capped (limit=101 and limit=1000 rejected with 422) on every list endpoint', async () => {
  const { token } = T['decornest-home'];
  const bad = [];
  for (const p of ['/console/products', '/console/orders', '/console/customers', '/console/reviews', '/console/coupons', '/console/returns', '/console/gift-cards']) {
    for (const l of [101, 1000]) {
      const r = await call('GET', `${p}?limit=${l}`, { token });
      if (r.status !== 422) bad.push(`${p}?limit=${l} -> ${r.status} rows=${rows(r).length}`);
    }
  }
  for (const l of [101, 1000]) {
    const r = await call('GET', `/storefront/products?limit=${l}`, { host: host('decornest-home') });
    if (r.status !== 422) bad.push(`/storefront/products?limit=${l} -> ${r.status}`);
  }
  perf.notes.pageCap = bad;
  assert.deepEqual(bad, []);
});

test('[PERF-003] no N+1: SQL statements per request do not grow linearly with page size', async () => {
  const { token } = T['freshbasket-grocery'];
  const H = host('freshbasket-grocery');
  const q0 = questions();
  await new Promise((r) => setTimeout(r, 1500));
  const idle = questions() - q0 - 1;
  const measure = async (p, opts) => {
    await call('GET', p, opts);
    const a = questions();
    const { ms } = await timed(() => call('GET', p, opts));
    const b = questions();
    return { statements: b - a - 1, ms };
  };
  const findings = [];
  for (const [base, opts] of [['/console/orders', { token }], ['/console/products', { token }], ['/console/customers', { token }], ['/console/reviews', { token }], ['/console/returns', { token }], ['/storefront/products', { host: H }]]) {
    const s = await measure(`${base}?limit=10`, opts);
    const l = await measure(`${base}?limit=100`, opts);
    perf.queryCounts.push({ endpoint: base, idleStatementsPer1500ms: idle, limit10: s, limit100: l, ratio: +(l.statements / Math.max(1, s.statements)).toFixed(1) });
    if (l.statements > 4 * Math.max(1, s.statements) && l.statements - s.statements > 60) findings.push(`${base}: ${s.statements} stmts @10 rows -> ${l.statements} stmts @100 rows (${l.ms} ms)`);
  }
  assert.deepEqual(findings, []);
});

// ---------------------------------------------------------------------------
// Cycle 3 Low items re-check (API side)
// ---------------------------------------------------------------------------

test('[LOW-001] seeded tenants have no subscription: GET /console/subscription returns an explicit empty state', async () => {
  const r = await call('GET', '/console/subscription', { token: T['sportzone-india'].token });
  perf.notes.subscription = { status: r.status, code: r.body?.error?.code, data: r.body?.data ?? null };
  assert.ok(r.status === 404 || r.body?.data === null, `GET /console/subscription -> ${r.status} ${JSON.stringify(r.body?.data)?.slice(0, 120)}`);
});

test('[LOW-002] oversized body -> 413 with a specific error code and a real correlationId', async () => {
  const big = 'x'.repeat(30 * 1024 * 1024);
  const res = await fetch(`${process.env.QA_API ?? 'http://localhost:4000/api/v1'}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@example.invalid', password: big }), signal: AbortSignal.timeout(60_000) });
  const body = await res.json().catch(() => ({}));
  perf.notes.oversized = { status: res.status, code: body?.error?.code, correlationId: body?.meta?.correlationId };
  assert.equal(res.status, 413);
  assert.notEqual(body?.error?.code, 'MALFORMED_REQUEST', 'error code for 413 is MALFORMED_REQUEST (expected PAYLOAD_TOO_LARGE or similar)');
  assert.ok(body?.meta?.correlationId && body.meta.correlationId !== 'unknown', `correlationId is '${body?.meta?.correlationId}'`);
});
