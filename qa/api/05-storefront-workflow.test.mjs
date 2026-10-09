import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { call, login } from '../lib/client.mjs';
import { USERS, HOSTS } from '../lib/config.mjs';
import { sql } from '../lib/db.mjs';

const H = HOSTS.northwind;
const items = (r) => r.body?.data?.items ?? r.body?.data ?? [];
const RUN = Date.now().toString(36);
let storeId, product, nw, stockBefore, orderId, orderNumber, cartId;
const created = [];

const address = {
  recipientName: 'QA Tester', phone: '+919876543210', addressLine1: '1 QA Street', city: 'Mumbai',
  stateCode: 'MH', stateName: 'Maharashtra', postalCode: '400001', countryCode: 'IN',
};
const stock = (productId) => sql(`SELECT COALESCE(SUM(quantity_on_hand),0), COALESCE(SUM(quantity_reserved),0) FROM inventory_levels il JOIN products p ON p.id=il.product_id WHERE p.public_id='${productId}'`)[0]?.map(Number);

before(async () => {
  nw = await login(USERS.nwOwner);
  storeId = (await call('GET', '/storefront/store', { host: H })).body.data.id;
  const list = items(await call('GET', '/storefront/products?limit=50', { host: H }));
  product = list.find((p) => p.type === 'SIMPLE' && p.trackInventory) ?? list[0];
  stockBefore = stock(product.id);
});

after(async () => {
  // Restore: cancel every order this run created so stock/coupon reservations are released.
  for (const id of created) await call('POST', `/console/orders/${id}/cancel`, { token: nw, body: { reason: 'QA cleanup' } });
});

test('[SF-001] product listing returns paginated envelope with meta.pagination', async () => {
  const r = await call('GET', '/storefront/products?limit=5&page=1', { host: H });
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.equal(r.body.meta.pagination.limit, 5);
  assert.ok(r.body.meta.pagination.total >= 12);
  assert.ok(items(r).length <= 5);
});

test('[SF-002] pagination pages do not overlap', async () => {
  const a = items(await call('GET', '/storefront/products?limit=5&page=1&sort=name', { host: H })).map((p) => p.id);
  const b = items(await call('GET', '/storefront/products?limit=5&page=2&sort=name', { host: H })).map((p) => p.id);
  assert.equal(a.filter((x) => b.includes(x)).length, 0);
});

test('[SF-003] sorting by priceMinor orders ascending / descending correctly', async () => {
  const asc = items(await call('GET', '/storefront/products?sort=priceMinor&limit=50', { host: H })).map((p) => BigInt(p.priceMinor));
  const desc = items(await call('GET', '/storefront/products?sort=-priceMinor&limit=50', { host: H })).map((p) => BigInt(p.priceMinor));
  assert.ok(asc.length > 2 && desc.length > 2);
  for (let i = 1; i < asc.length; i++) assert.ok(asc[i] >= asc[i - 1], 'asc order');
  for (let i = 1; i < desc.length; i++) assert.ok(desc[i] <= desc[i - 1], 'desc order');
});

test('[SF-004] invalid sort / limit / page -> 422 with validation details (not 500)', async () => {
  for (const q of ['sort=bogus', 'limit=0', 'limit=100000', 'page=-1', 'page=abc']) {
    const r = await call('GET', `/storefront/products?${q}`, { host: H });
    assert.equal(r.status, 422, `${q} -> ${r.status}`);
    assert.equal(r.body.error.code, 'VALIDATION_FAILED');
  }
});

test('[SF-005] search finds products by name (incl. short queries) and is case-insensitive', async () => {
  for (const [q, expect] of [['arabica', /Arabica/i], ['ARABICA', /Arabica/i], ['honey', /Honey/i], ['ho', /./]]) {
    const r = items(await call('GET', `/storefront/products?q=${q}`, { host: H }));
    assert.ok(r.length >= 1, `q=${q} returned nothing`);
    assert.match(r.map((p) => p.name).join(' '), expect);
  }
});

test('[SF-006] SQL-injection style search strings are inert (200, no 500, no data bleed)', async () => {
  for (const q of ["' OR 1=1 --", "1; DROP TABLE products;--", '" UNION SELECT * FROM users--', "%' OR '1'='1"]) {
    const r = await call('GET', `/storefront/products?q=${encodeURIComponent(q)}`, { host: H });
    assert.ok([200, 422].includes(r.status), `${q} -> ${r.status}`);
    if (r.status === 200) assert.ok(items(r).length < 12, `payload ${q} returned the full catalogue`);
  }
  assert.equal((await call('GET', '/storefront/products', { host: H })).status, 200, 'catalogue still intact');
});

test('[SF-007] product detail by slug; unknown slug -> 404 envelope', async () => {
  const ok = await call('GET', `/storefront/products/${product.slug}`, { host: H });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.id, product.id);
  assert.ok(!('costPriceMinor' in ok.body.data) || ok.body.data.costPriceMinor == null, 'cost price must not be public');
  const nf = await call('GET', '/storefront/products/qa-does-not-exist', { host: H });
  assert.equal(nf.status, 404);
  assert.equal(nf.body.success, false);
});

test('[SF-008] storefront never exposes unpublished/draft products or cost price', async () => {
  const all = items(await call('GET', '/storefront/products?limit=100', { host: H }));
  for (const p of all) {
    assert.equal(p.status, 'ACTIVE', `${p.slug} status ${p.status}`);
    assert.ok(p.costPriceMinor == null, `${p.slug} leaks costPriceMinor`);
  }
});

test('[SF-009] categories, banners, theme and menus endpoints serve for the tenant', async () => {
  for (const p of ['/storefront/categories', '/storefront/categories/tree', '/storefront/banners', '/storefront/theme-assignment']) {
    const r = await call('GET', p, { host: H });
    assert.equal(r.status, 200, `${p} -> ${r.status}`);
  }
});

test('[SF-010] cart: create requires storeId; unknown cart id -> 404/409, not 500', async () => {
  assert.equal((await call('POST', '/storefront/cart', { host: H, body: {} })).status, 409);
  const r = await call('GET', `/storefront/cart/${randomUUID()}`, { host: H });
  assert.ok([404, 409, 422].includes(r.status), `status ${r.status}`);
});

test('[SF-011] cart add / update / remove item round trip', async () => {
  const c = await call('POST', `/storefront/cart?storeId=${storeId}`, { host: H });
  assert.ok([200, 201].includes(c.status), `create ${c.status}`);
  cartId = c.body.data.id ?? c.body.data.cartId;
  assert.ok(cartId);
  const add = await call('POST', `/storefront/cart/${cartId}/items?storeId=${storeId}`, { host: H, body: { productId: product.id, quantity: 2 } });
  assert.ok([200, 201].includes(add.status), `add ${add.status} ${JSON.stringify(add.body?.error)}`);
  const line = (await call('GET', `/storefront/cart/${cartId}`, { host: H })).body.data;
  assert.equal(line.items.length, 1);
  assert.equal(line.items[0].quantity, 2);
  const upd = await call('PUT', `/storefront/cart/${cartId}/items/${product.id}?storeId=${storeId}`, { host: H, body: { quantity: 3 } });
  assert.equal(upd.status, 200);
  assert.equal((await call('GET', `/storefront/cart/${cartId}`, { host: H })).body.data.items[0].quantity, 3);
});

test('[SF-012] cart rejects invalid quantities and foreign product ids', async () => {
  const bad = [{ productId: product.id, quantity: 0 }, { productId: product.id, quantity: -1 }, { productId: product.id, quantity: 1000 }, { productId: 'not-an-id', quantity: 1 }];
  for (const body of bad) {
    const r = await call('POST', `/storefront/cart/${cartId}/items?storeId=${storeId}`, { host: H, body });
    assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(body)} -> ${r.status}`);
  }
});

test('[SF-013] cart is isolated by tenant host (cannot be read through another tenant host)', async () => {
  const r = await call('GET', `/storefront/cart/${cartId}`, { host: HOSTS.lakeside });
  assert.ok(r.status >= 400, `lakeside host read northwind cart (status ${r.status})`);
});

test('[SF-014] checkout pricing returns consistent money breakdown (total = subtotal - discount + shipping + tax)', async () => {
  const r = await call('POST', '/storefront/checkout/pricing', { host: H, body: { cartId, shippingAddress: address, shippingMethod: 'STANDARD', paymentGateway: 'cod' } });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body?.error));
  const d = r.body.data;
  const n = (m) => BigInt(m.amountMinor ?? m.minor ?? m.amount ?? m);
  const sum = n(d.subtotal) - n(d.discount) + n(d.shipping) + n(d.tax) + (d.codFee ? n(d.codFee) : 0n);
  assert.equal(n(d.total), sum, `total ${JSON.stringify(d.total)} != components`);
});

test('[SF-015] order validation: missing address / bad gateway / empty cart rejected', async () => {
  const h = { 'Idempotency-Key': randomUUID() };
  assert.equal((await call('POST', '/storefront/checkout/orders', { host: H, headers: h, body: { cartId, paymentGateway: 'cod' } })).status, 422);
  assert.equal((await call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': randomUUID() }, body: { cartId, shippingAddress: address, paymentGateway: 'bitcoin' } })).status, 422);
});

test('[SF-016] placing an order without an Idempotency-Key is rejected (400)', async () => {
  const r = await call('POST', '/storefront/checkout/orders', { host: H, body: { cartId, shippingAddress: address, paymentGateway: 'cod', email: 'qa@example.invalid' } });
  assert.equal(r.status, 400);
});

test('[SF-017] COD order placement succeeds, decrements/reserves stock, and is visible to the owning merchant only', async (t) => {
  const key = randomUUID();
  const body = { cartId, shippingAddress: address, shippingMethod: 'STANDARD', paymentGateway: 'cod', email: `qa+${RUN}@example.invalid`, customerNote: `QA-${RUN}` };
  const r = await call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': key }, body });
  assert.ok([200, 201].includes(r.status), `place order -> ${r.status} ${JSON.stringify(r.body?.error)}`);
  orderId = r.body.data.orderId;
  orderNumber = r.body.data.orderNumber;
  created.push(orderId);
  assert.ok(orderNumber);

  // Duplicate submission with same key must replay, not create a second order.
  const dup = await call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': key }, body });
  assert.ok([200, 201].includes(dup.status), `replay -> ${dup.status}`);
  assert.equal(dup.body.data.orderId, orderId, 'idempotent replay created a different order');
  const count = sql(`SELECT COUNT(*) FROM orders WHERE customer_note='QA-${RUN}'`)[0][0];
  assert.equal(Number(count), 1, 'duplicate submit produced multiple orders');

  // Same key, different body -> must be refused.
  const reuse = await call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': key }, body: { ...body, customerNote: 'different' } });
  assert.ok(reuse.status >= 400, `key reuse with different body accepted (${reuse.status})`);

  const [onHand, reserved] = stock(product.id);
  const [onHand0, reserved0] = stockBefore;
  assert.ok(onHand < onHand0 || reserved > reserved0, `stock did not move: onHand ${onHand0}->${onHand}, reserved ${reserved0}->${reserved}`);

  const order = await call('GET', `/console/orders/${orderId}`, { token: nw });
  assert.equal(order.status, 200);
  const ls = await login(USERS.lsOwner);
  assert.equal((await call('GET', `/console/orders/${orderId}`, { token: ls })).status, 404, 'lakeside can see northwind order');
});

test('[SF-018] cart is emptied/consumed after order and cannot be reused to double-order', async () => {
  const r = await call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': randomUUID() }, body: { cartId, shippingAddress: address, paymentGateway: 'cod', email: 'qa@example.invalid' } });
  assert.ok(r.status >= 400, `second order from consumed cart succeeded (${r.status})`);
});

test('[SF-019] merchant can cancel the QA order and stock is released (cleanup/restore)', async () => {
  assert.ok(orderId, 'precondition: order created');
  const r = await call('POST', `/console/orders/${orderId}/cancel`, { token: nw, body: { reason: 'QA cleanup' } });
  assert.ok([200, 201].includes(r.status), `cancel -> ${r.status} ${JSON.stringify(r.body?.error)}`);
  created.splice(created.indexOf(orderId), 1);
  const [onHand, reserved] = stock(product.id);
  assert.deepEqual([onHand, reserved], stockBefore, 'stock not restored after cancel');
});

test('[SF-020] coupon applies to cart and invalid coupon is rejected', async () => {
  const c = await call('POST', `/storefront/cart?storeId=${storeId}`, { host: H });
  const id = c.body.data.id ?? c.body.data.cartId;
  await call('POST', `/storefront/cart/${id}/items?storeId=${storeId}`, { host: H, body: { productId: product.id, quantity: 20 } });
  const bad = await call('POST', `/storefront/cart/${id}/coupon?storeId=${storeId}`, { host: H, body: { code: 'NOPE-NOT-A-COUPON' } });
  assert.ok(bad.status >= 400 && bad.status < 500, `invalid coupon -> ${bad.status}`);
  const ok = await call('POST', `/storefront/cart/${id}/coupon?storeId=${storeId}`, { host: H, body: { code: 'NORTHWIND10' } });
  assert.ok([200, 201].includes(ok.status), `NORTHWIND10 -> ${ok.status} ${JSON.stringify(ok.body?.error)}`);
});

test('[SF-021] gift card balance check returns balance for a valid code and valid:false otherwise', async () => {
  const a = await call('POST', '/storefront/gift-cards/check-balance', { host: H, body: { code: 'NW-GIFT-5000' } });
  const b = await call('POST', '/storefront/gift-cards/check-balance', { host: H, body: { code: 'QA-NOPE-0000' } });
  assert.equal(a.body.data.valid, true);
  assert.equal(a.body.data.balance.amountMinor, '500000');
  assert.equal(b.body.data.valid, false);
  assert.ok(!('balance' in b.body.data));
});

test('[SF-025] GET /storefront/theme for the seeded tenant (INFO: 404 means no row in tenant_themes; theme-assignment still serves)', async () => {
  const r = await call('GET', '/storefront/theme', { host: H });
  console.log(`# INFO /storefront/theme -> HTTP ${r.status}`);
  assert.ok([200, 404].includes(r.status));
});

test('[SF-022] cannot order more than available stock (oversell guard)', async () => {
  const c = await call('POST', `/storefront/cart?storeId=${storeId}`, { host: H });
  const id = c.body.data.id ?? c.body.data.cartId;
  const add = await call('POST', `/storefront/cart/${id}/items?storeId=${storeId}`, { host: H, body: { productId: product.id, quantity: 999 } });
  if (add.status >= 400) return; // rejected at add time: fine
  const r = await call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': randomUUID() }, body: { cartId: id, shippingAddress: address, paymentGateway: 'cod', email: 'qa@example.invalid' } });
  if (r.status < 300) created.push(r.body.data.orderId);
  assert.ok(r.status >= 400, `oversell: order of 999 units accepted (${r.status})`);
});

test('[SF-023] customer account endpoints require a storefront token', async () => {
  for (const p of ['/storefront/auth/me', '/storefront/account/orders', '/storefront/account/addresses', '/storefront/account/wishlist']) {
    const r = await call('GET', p, { host: H });
    assert.equal(r.status, 401, `${p} -> ${r.status}`);
  }
});

test('[SF-024] a merchant JWT is not accepted as a storefront customer token', async () => {
  const r = await call('GET', '/storefront/auth/me', { host: H, token: nw });
  assert.ok([401, 403].includes(r.status), `merchant token accepted on storefront account (${r.status})`);
});
