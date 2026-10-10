import http from 'node:http';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { call, login, decodeJwt } from '../lib/client.mjs';
import { USERS, HOSTS } from '../lib/config.mjs';

let nw, ls, nwProducts, nwCustomers, nwCoupons, fixtureCouponId;
const RUN = Date.now().toString(36).toUpperCase();
const rowsOf = (r) => r.body?.data?.items ?? r.body?.data ?? [];

before(async () => {
  nw = await login(USERS.nwOwner);
  ls = await login(USERS.lsOwner);
  nwProducts = (await call('GET', '/console/products?limit=50', { token: nw })).body.data;
  nwCustomers = (await call('GET', '/console/customers?limit=50', { token: nw })).body.data;
  nwCoupons = (await call('GET', '/console/coupons?limit=50', { token: nw })).body.data;
  // Lakeside fixture (QA-tagged, removed in after()) so the Northwind->Lakeside direction is real, not vacuous.
  const c = await call('POST', '/console/coupons', {
    token: ls,
    body: { code: `QAISO${RUN}`, name: 'QA isolation fixture', discountType: 'PERCENTAGE', discountValue: '5' },
  });
  if (c.status === 201 || c.status === 200) fixtureCouponId = c.body.data.id;
});

after(async () => {
  if (fixtureCouponId) await call('DELETE', `/console/coupons/${fixtureCouponId}`, { token: ls });
});

test('[TEN-001] tokens carry different tenant ids', () => {
  const a = decodeJwt(nw).tid;
  const b = decodeJwt(ls).tid;
  assert.ok(a && b);
  assert.notEqual(a, b);
});

test('[TEN-002] Northwind has data; Lakeside list endpoints show none of it', async () => {
  assert.ok(nwProducts.length > 0, 'precondition: northwind products seeded');
  const nwIds = new Set([...nwProducts, ...nwCustomers, ...nwCoupons].map((x) => x.id));
  for (const p of ['/console/products?limit=100', '/console/customers?limit=100', '/console/orders?limit=100']) {
    const r = await call('GET', p, { token: ls });
    assert.equal(r.status, 200);
    for (const row of r.body.data) assert.ok(!nwIds.has(row.id), `${p} leaked northwind id ${row.id}`);
  }
});

test('[TEN-003] Lakeside cannot read Northwind records by id (404)', async () => {
  for (const [p, id] of [
    ['/console/products', nwProducts[0].id],
    ['/console/customers', nwCustomers[0].id],
    ['/console/coupons', nwCoupons[0].id],
  ]) {
    const r = await call('GET', `${p}/${id}`, { token: ls });
    assert.equal(r.status, 404, `${p}/${id} -> ${r.status}`);
    assert.ok(!r.text.includes(nwProducts[0].name), 'response body leaked a northwind product name');
  }
});

test('[TEN-004] Lakeside cannot MODIFY or DELETE Northwind records (IDOR write)', async () => {
  const id = nwProducts[0].id;
  const put = await call('PUT', `/console/products/${id}`, { token: ls, body: { name: 'QA-HACKED' } });
  assert.equal(put.status, 404, `PUT -> ${put.status}`);
  const del = await call('DELETE', `/console/products/${id}`, { token: ls });
  assert.equal(del.status, 404, `DELETE -> ${del.status}`);
  const pub = await call('POST', `/console/products/${id}/publish`, { token: ls });
  assert.ok([403, 404].includes(pub.status), `publish -> ${pub.status}`);
  const after = await call('GET', `/console/products/${id}`, { token: nw });
  assert.equal(after.body.data.name, nwProducts[0].name, 'northwind product was changed');
});

test('[TEN-005] Northwind cannot see or touch the Lakeside fixture coupon', async (t) => {
  if (!fixtureCouponId) return t.skip('BLOCKED: could not create Lakeside fixture coupon');
  const own = await call('GET', `/console/coupons/${fixtureCouponId}`, { token: ls });
  assert.equal(own.status, 200, 'owner can read own fixture');
  assert.equal((await call('GET', `/console/coupons/${fixtureCouponId}`, { token: nw })).status, 404);
  const list = await call('GET', '/console/coupons?limit=100', { token: nw });
  assert.ok(!list.body.data.some((c) => c.id === fixtureCouponId), 'fixture leaked into northwind list');
  assert.equal((await call('PUT', `/console/coupons/${fixtureCouponId}`, { token: nw, body: { name: 'QA-HACKED' } })).status, 404);
  assert.equal((await call('DELETE', `/console/coupons/${fixtureCouponId}`, { token: nw })).status, 404);
  assert.equal((await call('GET', `/console/coupons/${fixtureCouponId}`, { token: ls })).body.data.name, 'QA isolation fixture');
});

test('[TEN-006] tenant switching via request headers/query is ignored (token tenant wins)', async () => {
  const nwTid = decodeJwt(nw).tid;
  // Lakeside owns its own products (organic-doorstep seed), so compare against its own baseline
  // list instead of assuming it is empty: a switch would add/replace rows with Northwind's.
  const baseline = await call('GET', '/console/products?limit=100', { token: ls });
  assert.equal(baseline.status, 200);
  const baselineIds = baseline.body.data.map((p) => p.id).sort().join(',');
  for (const headers of [{ 'x-tenant-id': nwTid }, { 'x-ems-tenant-slug': 'northwind' }, { 'x-ems-tenant-id': nwTid }, { 'x-ems-hostname': HOSTS.northwind }]) {
    const r = await call('GET', '/console/products?limit=100', { token: ls, headers });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.map((p) => p.id).sort().join(','), baselineIds, `header ${JSON.stringify(headers)} switched tenant`);
  }
  for (const q of [`tenantId=${nwTid}`, 'tenant=northwind', `tid=${nwTid}`]) {
    const r = await call('GET', `/console/products?limit=100&${q}`, { token: ls });
    assert.ok([200, 422].includes(r.status), `status ${r.status}`);
    if (r.status === 200) assert.equal(r.body.data.map((p) => p.id).sort().join(','), baselineIds, `query ${q} switched tenant`);
  }
});

test('[TEN-007] foreign storeId in body is rejected when creating a product', async () => {
  const nwStore = (await call('GET', '/console/stores', { token: nw })).body.data[0].id;
  const r = await call('POST', '/console/products', { token: ls, body: { name: 'QA cross-tenant', sku: `QAX-${RUN}`, storeId: nwStore } });
  assert.ok([403, 404, 422].includes(r.status), `status ${r.status}`);
  const probe = await call('GET', '/console/products?limit=100', { token: nw });
  assert.ok(!probe.body.data.some((p) => p.sku === `QAX-${RUN}`), 'cross-tenant product written into northwind store');
});

test('[TEN-008] merchant tokens cannot reach tenant data through /platform tenant routes', async () => {
  for (const t of [nw, ls]) {
    assert.equal((await call('GET', '/platform/tenants/1', { token: t })).status, 403);
    assert.equal((await call('GET', '/platform/tenants/1/overview', { token: t })).status, 403);
  }
});

test('[TEN-009] storefront resolves each hostname to its own tenant', async () => {
  const a = await call('GET', '/storefront/store', { host: HOSTS.northwind });
  assert.equal(a.status, 200);
  assert.match(a.text, /Northwind/i);
  const b = await call('GET', '/storefront/store', { host: HOSTS.lakeside });
  assert.ok([200, 404].includes(b.status), `lakeside store status ${b.status}`);
  assert.ok(!/Northwind Traders - Premium/i.test(b.text), 'lakeside host exposes northwind store');
});

test('[TEN-010] storefront product list is tenant-scoped by host', async () => {
  const a = await call('GET', '/storefront/products', { host: HOSTS.northwind });
  assert.equal(a.status, 200);
  assert.ok(rowsOf(a).length > 0);
  const b = await call('GET', '/storefront/products', { host: HOSTS.lakeside });
  assert.ok(!rowsOf(b).some((r) => nwProducts.some((p) => p.id === r.id)), 'lakeside storefront shows northwind products');
});

const rawStorefrontStore = (hostHeader) =>
  new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: 4000, path: '/api/v1/storefront/store', headers: { Host: hostHeader } }, (m) => {
      let b = '';
      m.on('data', (d) => (b += d));
      m.on('end', () => resolve({ status: m.statusCode, text: b }));
    });
    r.end();
  });

test('[TEN-011a] unknown real Host header is rejected (no tenant fall-through)', async () => {
  for (const host of ['evil.example.com', 'qa-unknown-tenant.ems.localhost']) {
    const r = await rawStorefrontStore(host);
    assert.ok([400, 404].includes(r.status), `${host} -> ${r.status}`);
    assert.ok(!/Northwind/i.test(r.text), `${host} exposed Northwind`);
  }
});

test('[TEN-011b] unknown x-ems-hostname must not resolve to another tenant (KNOWN DEFECT BUG-005)', async () => {
  // The storefront Next proxy forwards x-ems-hostname. When the API is reached via a dev host
  // (localhost), an UNKNOWN forwarded hostname falls back to the first ACTIVE tenant instead of 404.
  const r = await call('GET', '/storefront/products', { host: 'qa-unknown-tenant.ems.localhost' });
  assert.ok(!rowsOf(r).some((x) => nwProducts.some((p) => p.id === x.id)), `unknown host exposed northwind catalogue (status ${r.status})`);
});

test('[TEN-012] client-supplied tenant slug header cannot override the host (spoof)', async () => {
  const r = await call('GET', '/storefront/products', { host: HOSTS.lakeside, headers: { 'x-ems-tenant-slug': 'northwind' } });
  assert.ok(!rowsOf(r).some((x) => nwProducts.some((p) => p.id === x.id)), 'x-ems-tenant-slug spoof leaked northwind catalogue');
});

test('[TEN-013] bare localhost dev fallback (informational)', async () => {
  const r = await call('GET', '/storefront/store', { host: 'localhost' });
  assert.ok([200, 404].includes(r.status));
  console.log(`# INFO dev-fallback host=localhost -> HTTP ${r.status}${r.status === 200 ? ' (resolves to a tenant; must be disabled in production)' : ''}`);
});
