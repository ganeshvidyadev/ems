import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, login } from '../lib/client.mjs';
import { USERS, HOSTS, API, API_ROOT } from '../lib/config.mjs';

// -------------------------------------------------------------------------------------------
// Error envelope / contract consistency
// -------------------------------------------------------------------------------------------
test('[API-001] every error response uses the {success:false,error:{code,message},meta} envelope with a correlation id', async () => {
  const nw = await login(USERS.nwOwner);
  const samples = [
    await call('GET', '/auth/me'), // 401
    await call('GET', '/platform/tenants', { token: nw }), // 403
    await call('GET', '/console/products/does-not-exist', { token: nw }), // 404
    await call('POST', '/auth/login', { body: {} }), // 422
    await call('GET', '/storefront/products/qa-missing', { host: HOSTS.northwind }), // 404
  ];
  for (const r of samples) {
    assert.equal(r.body?.success, false, `status ${r.status}`);
    assert.ok(r.body.error?.code && r.body.error?.message, `status ${r.status} missing code/message`);
    assert.ok(r.body.meta?.correlationId, `status ${r.status} missing correlationId`);
    assert.ok(r.headers.get('x-correlation-id'), `status ${r.status} missing X-Correlation-Id header`);
  }
});

test('[API-002] unknown route returns a JSON 404, not an HTML/stack page', async () => {
  const r = await call('GET', '/qa/definitely-not-a-route');
  assert.equal(r.status, 404);
  assert.ok(r.body, 'non-JSON 404 body');
});

test('[API-003] list endpoints honour pagination limits and reject out-of-range values', async () => {
  const nw = await login(USERS.nwOwner);
  const ok = await call('GET', '/console/products?limit=5&page=1', { token: nw });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.data.length <= 5);
  for (const q of ['limit=0', 'limit=100000', 'page=0', 'limit=abc']) {
    const r = await call('GET', `/console/products?${q}`, { token: nw });
    assert.equal(r.status, 422, `${q} -> ${r.status}`);
  }
});

test('[API-004] malformed JSON body -> 4xx (not 500)', async () => {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email": ' });
  assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
});

test('[API-005] oversized body is rejected (not accepted/500)', async () => {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(5 * 1024 * 1024) }) });
  assert.ok([400, 413, 422].includes(res.status), `status ${res.status}`);
});

// -------------------------------------------------------------------------------------------
// Security checks (safe, non-destructive)
// -------------------------------------------------------------------------------------------
test('[SEC-001] security headers present on API responses (nosniff, no X-Powered-By)', async () => {
  const res = await fetch(`${API_ROOT}/health/live`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null, 'X-Powered-By discloses framework');
});

test('[SEC-002] CORS: a hostile origin is not reflected / credentialed', async () => {
  const res = await fetch(`${API}/plans`, { headers: { Origin: 'https://evil.example.com' } });
  const allow = res.headers.get('access-control-allow-origin');
  assert.ok(allow !== 'https://evil.example.com' && allow !== '*', `ACAO=${allow}`);
});

test('[SEC-003] CORS preflight from hostile origin does not authorise credentials', async () => {
  const res = await fetch(`${API}/auth/login`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' } });
  assert.notEqual(res.headers.get('access-control-allow-origin'), 'https://evil.example.com');
});

test('[SEC-004] SQL injection in login email/password does not authenticate or 500', async () => {
  for (const email of ["admin@ems.test' OR '1'='1", "' OR 1=1--@x.co", 'admin@ems.test"--']) {
    const r = await call('POST', '/auth/login', { body: { email, password: "' OR '1'='1" } });
    assert.ok([401, 422].includes(r.status), `${email} -> ${r.status}`);
  }
});

test('[SEC-005] SQL injection in filter/sort params on console list is inert', async () => {
  const nw = await login(USERS.nwOwner);
  for (const q of ["search=' OR 1=1--", "sort=name;DROP TABLE products", "status=ACTIVE' OR '1'='1", 'q=%27%20UNION%20SELECT%20password_hash%20FROM%20users--']) {
    const r = await call('GET', `/console/products?${q}`, { token: nw });
    assert.ok([200, 422].includes(r.status), `${q} -> ${r.status}`);
    assert.doesNotMatch(r.text, /password_hash|\$2[aby]\$/);
  }
});

test('[SEC-006] error responses do not leak stack traces, SQL or file paths', async () => {
  const probes = [
    await call('GET', '/console/products/%00'),
    await call('GET', '/storefront/products', { host: 'evil.example.com' }),
    await call('POST', '/auth/login', { body: { email: { $ne: null }, password: { $ne: null } } }),
  ];
  for (const r of probes) assert.doesNotMatch(r.text, /node_modules|at .*\(.*\.(ts|js):\d+|SELECT .* FROM|QueryFailedError|ER_[A-Z_]+/i, r.text.slice(0, 200));
});

test('[SEC-007] internal entity names are not exposed in client-facing error messages', async () => {
  // Observed: "Operation 'StoreEntity ...' requires a tenant context" on unknown Host header.
  const r = await new Promise((resolve) => {
    import('node:http').then(({ default: http }) => {
      http.request({ host: '127.0.0.1', port: 4000, path: '/api/v1/storefront/store', headers: { Host: 'evil.example.com' } }, (m) => {
        let b = '';
        m.on('data', (d) => (b += d));
        m.on('end', () => resolve({ status: m.statusCode, text: b }));
      }).end();
    });
  });
  assert.doesNotMatch(r.text, /Entity/, `leaks internal class name: ${r.text.slice(0, 160)}`);
});

test('[SEC-008] IDOR: one merchant cannot revoke another user\'s session', async () => {
  const nw = await login(USERS.nwOwner);
  const ls = await login(USERS.lsOwner);
  const lsSessions = (await call('GET', '/auth/sessions', { token: ls })).body.data;
  assert.ok(lsSessions.length > 0);
  const victim = lsSessions[0].familyId ?? lsSessions[0].id;
  const r = await call('DELETE', `/auth/sessions/${victim}`, { token: nw });
  assert.ok([403, 404].includes(r.status), `status ${r.status}`);
  const still = (await call('GET', '/auth/sessions', { token: ls })).body.data;
  assert.ok(still.some((s) => (s.familyId ?? s.id) === victim), 'victim session was revoked by another user');
});

test('[SEC-009] JWKS publishes only public key material', async () => {
  const r = await call('GET', `${API_ROOT}/.well-known/jwks.json`, { raw: true });
  assert.equal(r.status, 200);
  for (const k of r.body.keys) for (const priv of ['d', 'p', 'q', 'dp', 'dq', 'qi']) assert.ok(!(priv in k), `private JWK field ${priv} exposed`);
});

test('[SEC-010] Swagger/metrics exposure on this (dev) instance is reported, must be disabled/protected in production', async () => {
  const docs = await fetch(`${API_ROOT}/api/docs`);
  const metrics = await fetch(`${API_ROOT}/metrics`);
  console.log(`# INFO swagger=${docs.status} metrics=${metrics.status} (unauthenticated)`);
  assert.ok([200, 401, 403, 404].includes(docs.status));
});

test('[SEC-011] mass assignment: client-supplied tenantId / role fields are ignored on update', async () => {
  const nw = await login(USERS.nwOwner);
  const coupons = (await call('GET', '/console/coupons?limit=1', { token: nw })).body.data;
  const before = (await call('GET', `/console/coupons/${coupons[0].id}`, { token: nw })).body.data;
  const r = await call('PUT', `/console/coupons/${coupons[0].id}`, { token: nw, body: { name: before.name, tenantId: '999', tenant_id: 999, id: 'hijack', usageCount: 99999 } });
  assert.ok([200, 422].includes(r.status), `status ${r.status}`);
  const after = (await call('GET', `/console/coupons/${coupons[0].id}`, { token: nw })).body.data;
  assert.equal(after.id, before.id);
  assert.equal(after.usageCount, before.usageCount, 'usageCount was mass-assigned');
});

test('[SEC-012] RATE LIMITING: 40 rapid unauthenticated gift-card lookups are throttled (HTTP 429) — enumeration protection', async () => {
  const codes = [];
  for (let i = 0; i < 40; i++) {
    const r = await call('POST', '/storefront/gift-cards/check-balance', { host: HOSTS.northwind, body: { code: `QA-ENUM-${i}` } });
    codes.push(r.status);
  }
  assert.ok(codes.includes(429), `no throttling observed: statuses ${[...new Set(codes)].join(',')}`);
});

test('[SEC-013] RATE LIMITING: repeated failed logins for one unknown account are throttled or locked', async () => {
  const email = `qa-bruteforce-${Date.now()}@example.invalid`;
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await call('POST', '/auth/login', { body: { email, password: `Wrong-Password-${i}!` } })).status);
  assert.ok(codes.some((c) => c === 429 || c === 423), `12 failed attempts never throttled: ${[...new Set(codes)].join(',')}`);
});

test('[SEC-014] account lockout exists for a real account after repeated failures (uses a throwaway invite-free check: informational)', async (t) => {
  t.skip('NOT_TESTED: would lock a shared demo account for 15 minutes; verified by reading auth.service.ts (5 failures / 15 min)');
});
