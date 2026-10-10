// BUG-014 regression: console order list and sales-summary filters take PUBLIC store/customer ids
// (ULIDs) and must resolve them to internal ids inside the caller's tenant (fix 22414ec).
// Read-only: no writes. Needs the realistic seed tenants (electrohub-india, styleverse-fashion,
// freshbasket-grocery). Env: QA_API (default :4000).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { call, login } from '../lib/client.mjs';
import { sql } from '../lib/db.mjs';

const SLUGS = ['electrohub-india', 'styleverse-fashion', 'freshbasket-grocery'];
const FROM = '2026-04-14';
const TO = '2026-10-10';
const one = (q) => sql(q)[0]?.[0];
const items = (r) => r.body?.data?.items ?? r.body?.data ?? [];
const total = (r) => r.body?.meta?.pagination?.total;
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const randomUlid = () => Array.from({ length: 26 }, (_, i) => CROCK[Math.floor(Math.random() * (i === 0 ? 8 : 32))]).join('');

const T = {};
const evidence = {};

before(async () => {
  for (const slug of SLUGS) {
    const token = await login(`owner@${slug}.test`);
    const tid = one(`SELECT id FROM tenants WHERE slug='${slug}'`);
    const stores = items(await call('GET', '/console/stores', { token }));
    // customer with the most orders in this tenant (public id via DB, because order responses expose internal ids)
    const [custInternal, custPublic, custOrders] = sql(
      `SELECT c.id, c.public_id, COUNT(o.id) n FROM orders o JOIN customers c ON c.id=o.customer_id
       WHERE o.tenant_id=${tid} GROUP BY c.id, c.public_id ORDER BY n DESC, c.id LIMIT 1`,
    )[0];
    T[slug] = {
      tid,
      token,
      storePublic: stores[0]?.id,
      dbOrders: Number(one(`SELECT COUNT(*) FROM orders WHERE tenant_id=${tid}`)),
      dbRollupOrders: Number(one(`SELECT COALESCE(SUM(orders_count),0) FROM daily_sales_rollup WHERE tenant_id=${tid} AND channel='ALL' AND \`date\` BETWEEN '${FROM}' AND '${TO}'`)),
      custInternal,
      custPublic,
      custOrders: Number(custOrders),
    };
    assert.ok(T[slug].storePublic, `${slug}: /console/stores returned a store`);
  }
});

const get = (slug, p) => call('GET', p, { token: T[slug].token });
const summary = (slug, extra = '') => get(slug, `/console/reports/sales-summary?from=${FROM}&to=${TO}${extra}`);

for (const [i, slug] of SLUGS.entries()) {
  test(`[B14-00${i + 1}] ${slug}: /console/orders?storeId=<public id> total equals unfiltered and DB, pagination works`, async () => {
    const t = T[slug];
    const all = await get(slug, '/console/orders?limit=20');
    const f1 = await get(slug, `/console/orders?limit=20&page=1&storeId=${t.storePublic}`);
    const f2 = await get(slug, `/console/orders?limit=20&page=2&storeId=${t.storePublic}`);
    const lastPage = Math.ceil(t.dbOrders / 20);
    const fl = await get(slug, `/console/orders?limit=20&page=${lastPage}&storeId=${t.storePublic}`);
    evidence[slug] = { unfiltered: total(all), filtered: total(f1), db: t.dbOrders };
    assert.equal(f1.status, 200);
    assert.equal(total(all), t.dbOrders);
    assert.equal(total(f1), t.dbOrders, 'storeId filter must not empty the list');
    assert.equal(items(f1).length, 20);
    assert.equal(f1.body.meta.pagination.totalPages, lastPage);
    assert.equal(f1.body.meta.pagination.hasNext, true);
    const ids1 = new Set(items(f1).map((o) => o.id));
    assert.equal(items(f2).length, 20);
    assert.ok(items(f2).every((o) => !ids1.has(o.id)), 'page 2 does not repeat page 1');
    assert.equal(items(fl).length, t.dbOrders - (lastPage - 1) * 20, 'last page has the remainder');
    assert.equal(fl.body.meta.pagination.hasNext, false);
    assert.ok([...items(f1), ...items(f2)].every((o) => o.storeId === t.storePublic), 'items carry the filtered store public id');
  });

  test(`[B14-01${i}] ${slug}: sales-summary?storeId=<public id> ordersCount equals unfiltered and rollup DB, byDay populated`, async () => {
    const t = T[slug];
    const all = await summary(slug);
    const f = await summary(slug, `&storeId=${t.storePublic}`);
    assert.equal(f.status, 200);
    const a = all.body.data;
    const d = f.body.data;
    evidence[`${slug}:summary`] = { unfiltered: a.ordersCount, filtered: d.ordersCount, db: t.dbRollupOrders, byDay: d.byDay.length };
    assert.equal(a.ordersCount, t.dbRollupOrders);
    assert.equal(d.ordersCount, a.ordersCount);
    assert.equal(d.grossMinor, a.grossMinor);
    assert.equal(d.netMinor, a.netMinor);
    assert.ok(d.byDay.length > 0, 'byDay populated');
    assert.equal(d.byDay.length, a.byDay.length);
    assert.equal(d.byDay.reduce((s, r) => s + Number(r.ordersCount), 0), d.ordersCount);
  });

  test(`[B14-02${i}] ${slug}: /console/orders?customerId=<public id> returns only that customer's orders (DB count)`, async () => {
    const t = T[slug];
    const r = await get(slug, `/console/orders?limit=100&customerId=${t.custPublic}`);
    evidence[`${slug}:customer`] = { api: total(r), db: t.custOrders };
    assert.equal(r.status, 200);
    assert.ok(t.custOrders > 0);
    assert.equal(total(r), t.custOrders);
    const dbIds = new Set(sql(`SELECT o.public_id FROM orders o WHERE o.tenant_id=${t.tid} AND o.customer_id=${t.custInternal}`).map((x) => x[0]));
    assert.ok(items(r).every((o) => dbIds.has(o.id)), 'every returned order belongs to the customer');
    const both = await get(slug, `/console/orders?limit=100&customerId=${t.custPublic}&storeId=${t.storePublic}`);
    assert.equal(total(both), t.custOrders, 'storeId + customerId combine');
  });
}

test('[B14-030] unknown (random valid ULID) storeId / customerId returns total 0 and ordersCount 0', async () => {
  const slug = SLUGS[0];
  const ulid = randomUlid();
  const o1 = await get(slug, `/console/orders?storeId=${ulid}`);
  const o2 = await get(slug, `/console/orders?customerId=${ulid}`);
  const s = await summary(slug, `&storeId=${ulid}`);
  assert.equal(o1.status, 200);
  assert.equal(total(o1), 0);
  assert.equal(items(o1).length, 0);
  assert.equal(o2.status, 200);
  assert.equal(total(o2), 0);
  assert.equal(s.status, 200);
  assert.equal(s.body.data.ordersCount, 0);
  assert.equal(s.body.data.byDay.length, 0);
});

test('[B14-031] cross-tenant store and customer public ids return 0, never the other tenant\'s data (all directions)', async () => {
  for (const a of SLUGS) {
    for (const b of SLUGS) {
      if (a === b) continue;
      const o = await get(a, `/console/orders?storeId=${T[b].storePublic}`);
      const c = await get(a, `/console/orders?customerId=${T[b].custPublic}`);
      const s = await summary(a, `&storeId=${T[b].storePublic}`);
      assert.equal(o.status, 200, `${a} -> ${b} store`);
      assert.equal(total(o), 0, `${a} with ${b}'s store id must see 0 orders`);
      assert.equal(c.status, 200);
      assert.equal(total(c), 0, `${a} with ${b}'s customer id must see 0 orders`);
      assert.equal(s.status, 200);
      assert.equal(s.body.data.ordersCount, 0, `${a} with ${b}'s store id must see ordersCount 0`);
      assert.equal(s.body.data.byDay.length, 0);
    }
  }
});

test('[B14-032] malformed storeId / customerId on /console/orders is rejected with 422 VALIDATION_FAILED', async () => {
  const slug = SLUGS[0];
  for (const q of ['storeId=not-a-ulid', 'customerId=not-a-ulid', 'storeId=1', "storeId=' OR 1=1 --"]) {
    const r = await get(slug, `/console/orders?${encodeURI(q)}`);
    assert.equal(r.status, 422, q);
    assert.equal(r.body?.error?.code, 'VALIDATION_FAILED', q);
  }
});

test('[B14-033] sales-summary with a non-ULID storeId (schema is z.string) is inert: 200 with ordersCount 0, never 500 or widened', async () => {
  const slug = SLUGS[0];
  for (const v of ['not-a-ulid', '1', "' OR 1=1 --"]) {
    const s = await summary(slug, `&storeId=${encodeURIComponent(v)}`);
    assert.equal(s.status, 200, v);
    assert.equal(s.body.data.ordersCount, 0, `storeId=${v} must not widen to the tenant's totals`);
  }
});

test('[B14-099] evidence', () => {
  console.log('B14-EVIDENCE', JSON.stringify(evidence));
});
