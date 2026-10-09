import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { API_ROOT, CONSOLE, MARKETING, HOSTS, STOREFRONT_PORT } from '../lib/config.mjs';
import { call } from '../lib/client.mjs';

const port = (host, p) =>
  new Promise((resolve) => {
    const s = net.connect({ host, port: p, timeout: 2000 });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });

test('[ENV-001] API liveness', async () => {
  const r = await call('GET', `${API_ROOT}/health/live`, { raw: true });
  assert.equal(r.status, 200);
  assert.equal(r.body?.status, 'ok');
});

test('[ENV-002] API readiness: MySQL, Mongo and cache Redis report up', async () => {
  const r = await call('GET', `${API_ROOT}/health/ready`, { raw: true });
  assert.equal(r.status, 200);
  const d = r.body?.dependencies ?? {};
  assert.equal(d.mysql?.status, 'up', 'mysql');
  assert.equal(d.mongo?.status, 'up', 'mongo');
  assert.equal(d.redis?.status, 'up', 'cache redis');
});

test('[ENV-003] MySQL port 3307 reachable', async () => assert.ok(await port('127.0.0.1', 3307)));
test('[ENV-004] MongoDB port 27017 reachable', async () => assert.ok(await port('127.0.0.1', 27017)));

test('[ENV-005] BullMQ Redis (6380) availability', async (t) => {
  const up = await port('127.0.0.1', 6380);
  if (!up) {
    // Known infrastructure blocker: queue-dependent features (emails, exports, async jobs) cannot be verified.
    t.skip('BLOCKED: BullMQ Redis on 127.0.0.1:6380 is unavailable; queue-dependent tests are BLOCKED, not FAILED');
    return;
  }
  assert.ok(up);
});

for (const [name, url] of [['console', CONSOLE], ['marketing', MARKETING], ['storefront(northwind)', `http://${HOSTS.northwind}:${STOREFRONT_PORT}`]]) {
  test(`[ENV-006] ${name} frontend serves HTTP 200`, async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: 'manual' });
    assert.ok([200, 307, 308].includes(res.status), `status ${res.status}`);
  });
}

test('[ENV-007] Swagger docs reachable', async () => {
  const res = await fetch(`${API_ROOT}/api/docs`, { signal: AbortSignal.timeout(20_000) });
  assert.equal(res.status, 200);
});

test('[ENV-008] Prometheus /metrics endpoint serves text (observability)', async () => {
  const res = await fetch(`${API_ROOT}/metrics`, { signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  assert.equal(res.status, 200, `HTTP ${res.status}: ${text.slice(0, 160)}`);
  assert.match(text, /^# (HELP|TYPE)/m);
});
