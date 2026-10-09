import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, login, decodeJwt } from '../lib/client.mjs';
import { USERS, DEMO_PASSWORD } from '../lib/config.mjs';

for (const [role, email] of Object.entries(USERS)) {
  test(`[AUTH-001] ${role} can log in and /auth/me returns own identity`, async () => {
    const token = await login(email);
    const me = await call('GET', '/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.body?.success, true);
    assert.equal(JSON.stringify(me.body).includes(email), true);
  });
}

test('[AUTH-002] login response never leaks password hash / secrets', async () => {
  const r = await call('POST', '/auth/login', { body: { email: USERS.nwOps, password: DEMO_PASSWORD } });
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /passwordHash|password_hash|\$2[aby]\$/i);
});

test('[AUTH-003] wrong password for unknown account is rejected with 401 and generic error', async () => {
  const r = await call('POST', '/auth/login', { body: { email: 'qa-nonexistent@example.invalid', password: 'x'.repeat(12) } });
  assert.equal(r.status, 401);
  assert.equal(r.body?.success, false);
  assert.ok(r.body?.error?.code);
});

test('[AUTH-004] wrong password for a real account (single attempt) is 401, same shape as unknown account', async () => {
  const unknown = await call('POST', '/auth/login', { body: { email: 'qa-nonexistent2@example.invalid', password: 'Wrong-Password-1' } });
  const known = await call('POST', '/auth/login', { body: { email: USERS.lsOps, password: 'Wrong-Password-1' } });
  assert.equal(known.status, 401);
  assert.equal(known.body?.error?.code, unknown.body?.error?.code, 'error code must not allow account enumeration');
  assert.equal(known.body?.error?.message, unknown.body?.error?.message, 'error message must not allow account enumeration');
  // a good login afterwards must still work and reset the failure counter
  const ok = await call('POST', '/auth/login', { body: { email: USERS.lsOps, password: DEMO_PASSWORD } });
  assert.equal(ok.status, 200);
});

test('[AUTH-005] login with missing fields -> 422 validation envelope', async () => {
  const r = await call('POST', '/auth/login', { body: {} });
  assert.equal(r.status, 422);
  assert.equal(r.body?.error?.code, 'VALIDATION_FAILED');
  assert.ok(Array.isArray(r.body?.error?.details) && r.body.error.details.length > 0);
});

test('[AUTH-006] protected endpoint without token -> 401', async () => {
  for (const p of ['/auth/me', '/console/products', '/console/orders', '/platform/tenants', '/platform/website']) {
    const r = await call('GET', p);
    assert.equal(r.status, 401, p);
  }
});

test('[AUTH-007] malformed / garbage bearer token -> 401', async () => {
  for (const token of ['garbage', 'a.b.c', '']) {
    const r = await call('GET', '/auth/me', { token: token || undefined, headers: token ? {} : { Authorization: 'Bearer ' } });
    assert.equal(r.status, 401, `token=${token}`);
  }
});

test('[AUTH-008] tampered JWT payload (privilege escalation attempt) -> 401', async () => {
  const token = await login(USERS.nwOps);
  const [h, p, s] = token.split('.');
  const payload = decodeJwt(token);
  payload.userType = 'PLATFORM';
  payload.perms = ['platform.tenant:read', 'platform.website:update'];
  const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
  const r = await call('GET', '/platform/tenants', { token: forged });
  assert.equal(r.status, 401);
});

test('[AUTH-009] alg=none JWT is rejected', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'x', userType: 'PLATFORM', roles: ['PLATFORM_SUPER_ADMIN'] })).toString('base64url');
  const r = await call('GET', '/platform/tenants', { token: `${header}.${payload}.` });
  assert.equal(r.status, 401);
});

test('[AUTH-010] access token carries expected claims and a short TTL', async () => {
  const c = decodeJwt(await login(USERS.nwOwner));
  assert.ok(c.exp && c.iat, 'exp/iat');
  assert.ok(c.exp - c.iat <= 15 * 60, `access token TTL ${(c.exp - c.iat)}s should be <= 15 min`);
  assert.equal(c.userType, 'TENANT');
  assert.ok(c.tid, 'tenant id claim present');
});

test('[AUTH-011] logout invalidates the access token (denylist)', async () => {
  // fresh login on purpose; do not reuse the cached token
  const r = await call('POST', '/auth/login', { body: { email: USERS.lsOps, password: DEMO_PASSWORD } });
  const token = r.body.data.accessToken;
  assert.equal((await call('GET', '/auth/me', { token })).status, 200);
  const out = await call('POST', '/auth/logout', { token });
  assert.ok([200, 204].includes(out.status), `logout status ${out.status}`);
  const after = await call('GET', '/auth/me', { token });
  assert.equal(after.status, 401, 'token must be rejected after logout');
});

test('[AUTH-012] refresh without a refresh cookie is rejected', async () => {
  const r = await call('POST', '/auth/refresh', { body: {} });
  assert.ok([400, 401, 422].includes(r.status), `status ${r.status}`);
});

test('[AUTH-013] refresh cookie is HttpOnly (session security)', async () => {
  const res = await fetch(`${(await import('../lib/config.mjs')).API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USERS.nwOps, password: DEMO_PASSWORD }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const refresh = cookies.find((c) => /refresh/i.test(c));
  assert.ok(refresh, `no refresh cookie in Set-Cookie: ${JSON.stringify(cookies.map((c) => c.split('=')[0]))}`);
  assert.match(refresh, /HttpOnly/i);
  assert.match(refresh, /SameSite=/i);
});

test('[AUTH-014] register with invalid payload -> 422, not 500', async () => {
  const r = await call('POST', '/auth/register', { body: { email: 'not-an-email' } });
  assert.equal(r.status, 422);
});

test('[AUTH-015] forgot-password does not reveal whether an account exists', async () => {
  const a = await call('POST', '/auth/forgot-password', { body: { email: 'qa-nonexistent3@example.invalid' } });
  const b = await call('POST', '/auth/forgot-password', { body: { email: USERS.nwOps } });
  assert.equal(a.status, b.status, 'same status for unknown and known email');
});
