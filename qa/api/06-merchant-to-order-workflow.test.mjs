import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { call, login } from '../lib/client.mjs';
import { USERS, HOSTS } from '../lib/config.mjs';
import { sql } from '../lib/db.mjs';

/**
 * End-to-end business workflow with a merchant-created fixture (not seed data):
 * Product creation -> inventory -> publish -> storefront browse -> cart -> COD checkout ->
 * order in console -> stock movement -> cancel -> stock restored -> cleanup.
 * Everything created here is QA-tagged and removed/cancelled in after().
 * COD only: no real payment, shipment or email is initiated.
 */
const H = HOSTS.northwind;
const RUN = Date.now().toString(36).toUpperCase();
let nw, storeId, warehouseId, productId, productSlug, orderId, cartId;

const address = { recipientName: 'QA Tester', phone: '+919876543210', addressLine1: '1 QA Street', city: 'Mumbai', stateCode: 'MH', stateName: 'Maharashtra', postalCode: '400001', countryCode: 'IN' };
const levelRow = () => sql(`SELECT quantity_on_hand, quantity_reserved FROM inventory_levels il JOIN products p ON p.id=il.product_id WHERE p.public_id='${productId}'`)[0]?.map(Number);

before(async () => {
  nw = await login(USERS.nwOwner);
  storeId = (await call('GET', '/console/stores', { token: nw })).body.data[0].id;
  warehouseId = (await call('GET', '/console/warehouses', { token: nw })).body.data[0].id;
});

after(async () => {
  if (orderId) await call('POST', `/console/orders/${orderId}/cancel`, { token: nw, body: { reason: 'QA cleanup' } });
  if (productId) await call('DELETE', `/console/products/${productId}`, { token: nw });
});

test('[WF-001] merchant creates a SIMPLE product (draft) via console API', async () => {
  const r = await call('POST', '/console/products', {
    token: nw,
    body: { storeId, name: `QA Workflow Product ${RUN}`, sku: `QA-WF-${RUN}`, type: 'SIMPLE', status: 'DRAFT', priceMinor: '12345', trackInventory: true, shortDescription: 'qa fixture' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body?.error));
  productId = r.body.data.id;
  productSlug = r.body.data.slug;
  assert.equal(r.body.data.priceMinor, '12345');
  assert.equal(r.body.data.status, 'DRAFT');
});

test('[WF-002] duplicate SKU in the same tenant is rejected (409/422)', async () => {
  const r = await call('POST', '/console/products', { token: nw, body: { storeId, name: 'QA dup', sku: `QA-WF-${RUN}`, type: 'SIMPLE' } });
  assert.ok([409, 422].includes(r.status), `duplicate SKU accepted (${r.status})`);
});

test('[WF-003] draft product is NOT visible on the public storefront', async () => {
  const r = await call('GET', `/storefront/products/${productSlug}`, { host: H });
  assert.equal(r.status, 404);
});

test('[WF-004] merchant adds stock (inventory adjust) and publishes the product', async () => {
  const adj = await call('POST', '/console/inventory/adjust', { token: nw, body: { warehouseId, productId, quantityDelta: 10, type: 'ADJUSTMENT', reason: 'QA seed stock' } });
  assert.ok([200, 201].includes(adj.status), `adjust -> ${adj.status} ${JSON.stringify(adj.body?.error)}`);
  const pub = await call('POST', `/console/products/${productId}/publish`, { token: nw });
  assert.ok([200, 201].includes(pub.status), `publish -> ${pub.status} ${JSON.stringify(pub.body?.error)}`);
  assert.deepEqual(levelRow(), [10, 0]);
});

test('[WF-005] published product is visible on the Northwind storefront with correct price', async () => {
  const r = await call('GET', `/storefront/products/${productSlug}`, { host: H });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.priceMinor, '12345');
  const lk = await call('GET', `/storefront/products/${productSlug}`, { host: HOSTS.lakeside });
  assert.notEqual(lk.status, 200, 'product visible on Lakeside storefront');
});

test('[WF-006] customer cart -> pricing -> COD order succeeds for a merchant-created product', async () => {
  const sid = (await call('GET', '/storefront/store', { host: H })).body.data.id;
  const c = await call('POST', `/storefront/cart?storeId=${sid}`, { host: H });
  cartId = c.body.data.id ?? c.body.data.cartId;
  const add = await call('POST', `/storefront/cart/${cartId}/items?storeId=${sid}`, { host: H, body: { productId, quantity: 2 } });
  assert.ok([200, 201].includes(add.status), `add ${add.status}`);
  const pr = await call('POST', '/storefront/checkout/pricing', { host: H, body: { cartId, shippingAddress: address, shippingMethod: 'STANDARD', paymentGateway: 'cod' } });
  assert.ok([200, 201].includes(pr.status), JSON.stringify(pr.body?.error));
  const sub = BigInt(pr.body.data.subtotal.amountMinor ?? pr.body.data.subtotal);
  assert.equal(sub, 24690n, 'subtotal = 2 x 123.45');

  const key = randomUUID();
  const body = { cartId, shippingAddress: address, shippingMethod: 'STANDARD', paymentGateway: 'cod', email: `qa+${RUN}@example.invalid`, customerNote: `QA-WF-${RUN}` };
  const o = await call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': key }, body });
  assert.ok([200, 201].includes(o.status), `order -> ${o.status} ${JSON.stringify(o.body?.error)}`);
  orderId = o.body.data.orderId;
  const replay = await call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': key }, body });
  assert.equal(replay.body.data.orderId, orderId, 'idempotent replay must return the same order');
  assert.equal(Number(sql(`SELECT COUNT(*) FROM orders WHERE customer_note='QA-WF-${RUN}'`)[0][0]), 1, 'double order on duplicate submit');
});

test('[WF-007] order is consistent: stock reserved, totals add up, status COD pending/confirmed', async () => {
  const [onHand, reserved] = levelRow();
  assert.equal(onHand - reserved, 8, `available should be 8, got on_hand=${onHand} reserved=${reserved}`);
  const o = (await call('GET', `/console/orders/${orderId}`, { token: nw })).body.data;
  const n = (m) => BigInt(m?.amountMinor ?? m?.minor ?? m);
  assert.equal(n(o.total ?? o.totalMinor), n(o.subtotal ?? o.subtotalMinor) - n(o.discount ?? o.discountMinor ?? 0) + n(o.shipping ?? o.shippingMinor ?? 0) + n(o.tax ?? o.taxMinor ?? 0) + n(o.codFee ?? o.codFeeMinor ?? 0), 'order total != components');
  assert.ok(['PENDING', 'CONFIRMED', 'PROCESSING'].includes(o.status), `status ${o.status}`);
  const rows = sql(`SELECT total_minor, subtotal_minor, shipping_minor, tax_minor, cod_fee_minor, discount_minor FROM orders WHERE public_id='${orderId}'`)[0].map(BigInt);
  assert.equal(rows[0], rows[1] - rows[5] + rows[2] + rows[3] + rows[4], 'DB totals inconsistent');
});

test('[WF-008] order appears in merchant order list but never for Lakeside', async () => {
  const mine = (await call('GET', '/console/orders?limit=100', { token: nw })).body.data;
  assert.ok(mine.some((x) => x.id === orderId));
  const ls = await login(USERS.lsOwner);
  assert.equal((await call('GET', `/console/orders/${orderId}`, { token: ls })).status, 404);
});

test('[WF-009] inventory movement is recorded for the reservation (audit trail)', async () => {
  const mv = await call('GET', `/console/inventory/movements/${productId}`, { token: nw });
  assert.equal(mv.status, 200);
  const rows = mv.body.data.items ?? mv.body.data;
  assert.ok(rows.some((m) => m.type === 'RESERVATION'), 'no RESERVATION movement');
  assert.ok(rows.some((m) => m.type === 'ADJUSTMENT'), 'no ADJUSTMENT movement');
});

test('[WF-010] cancelling releases stock (full restore)', async () => {
  const r = await call('POST', `/console/orders/${orderId}/cancel`, { token: nw, body: { reason: 'QA cleanup' } });
  assert.ok([200, 201].includes(r.status), `cancel ${r.status} ${JSON.stringify(r.body?.error)}`);
  assert.deepEqual(levelRow(), [10, 0], 'stock not released');
  const o = (await call('GET', `/console/orders/${orderId}`, { token: nw })).body.data;
  assert.equal(o.status, 'CANCELLED');
  orderId = null; // already cancelled; skip in after()
});

test('[WF-011] cannot cancel an already cancelled order twice (state machine)', async () => {
  const ordRow = sql(`SELECT public_id FROM orders WHERE customer_note='QA-WF-${RUN}'`)[0][0];
  const r = await call('POST', `/console/orders/${ordRow}/cancel`, { token: nw, body: { reason: 'again' } });
  assert.ok(r.status >= 400 && r.status < 500, `double cancel -> ${r.status}`);
});

test('[WF-012] after the order is cancelled the same product can no longer exceed stock (11 > 10 rejected)', async () => {
  const sid = (await call('GET', '/storefront/store', { host: H })).body.data.id;
  const c = await call('POST', `/storefront/cart?storeId=${sid}`, { host: H });
  const id = c.body.data.id ?? c.body.data.cartId;
  await call('POST', `/storefront/cart/${id}/items?storeId=${sid}`, { host: H, body: { productId, quantity: 11 } });
  const r = await call('POST', '/storefront/checkout/orders', { host: H, headers: { 'Idempotency-Key': randomUUID() }, body: { cartId: id, shippingAddress: address, paymentGateway: 'cod', email: 'qa@example.invalid' } });
  assert.equal(r.status, 409, `oversell not blocked: ${r.status}`);
  assert.equal(r.body.error.code, 'INVENTORY_INSUFFICIENT');
});
