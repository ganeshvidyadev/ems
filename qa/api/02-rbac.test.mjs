import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, login } from '../lib/client.mjs';
import { USERS } from '../lib/config.mjs';

const TENANT_ROLES = ['nwOwner', 'nwOps', 'lsOwner', 'lsOps'];

const PLATFORM_READS = ['/platform/tenants', '/platform/plans', '/platform/website', '/platform/settings', '/platform/users', '/platform/billing/invoices', '/platform/audit-logs'];

for (const role of TENANT_ROLES) {
  test(`[RBAC-001] ${role} is forbidden from every /platform/* read`, async () => {
    const token = await login(USERS[role]);
    for (const p of PLATFORM_READS) {
      const r = await call('GET', p, { token });
      assert.equal(r.status, 403, `${role} GET ${p} -> ${r.status}`);
    }
  });
}

test('[RBAC-002] merchant owner cannot write platform website content', async () => {
  const token = await login(USERS.nwOwner);
  const r = await call('PUT', '/platform/website', { token, body: { hero: { titlePrefix: 'hacked' } } });
  assert.ok([401, 403].includes(r.status), `status ${r.status}`);
});

test('[RBAC-003] merchant owner cannot create/modify platform plans, tenants or staff', async () => {
  const token = await login(USERS.nwOwner);
  for (const [m, p, b] of [
    ['POST', '/platform/plans', { code: 'qa-evil', name: 'x' }],
    ['PUT', '/platform/plans/basic', { name: 'hacked' }],
    ['POST', '/platform/tenants', { name: 'x' }],
    ['POST', '/platform/users', { email: 'qa-evil@example.invalid' }],
  ]) {
    const r = await call(m, p, { token, body: b });
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status}`);
  }
});

test('[RBAC-004] super admin (platform user, no tenant) is not granted tenant /console/* data', async () => {
  const token = await login(USERS.superAdmin);
  for (const p of ['/console/products', '/console/orders', '/console/customers', '/console/coupons']) {
    const r = await call('GET', p, { token });
    assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
  }
});

test('[RBAC-005] ORDER_MANAGER / PRODUCT_MANAGER roles are least-privilege', async () => {
  const ops = await login(USERS.nwOps);
  for (const p of ['/console/coupons', '/console/stores', '/console/warehouses', '/console/invitations', '/console/subscription']) {
    const r = await call('GET', p, { token: ops });
    assert.equal(r.status, 403, `nwOps(ORDER_MANAGER) GET ${p} -> ${r.status}`);
  }
  const lsOps = await login(USERS.lsOps);
  for (const p of ['/console/orders', '/console/customers']) {
    const r = await call('GET', p, { token: lsOps });
    assert.equal(r.status, 403, `lsOps(PRODUCT_MANAGER) GET ${p} -> ${r.status}`);
  }
});

test('[RBAC-006] ORDER_MANAGER cannot create products or coupons (write separation)', async () => {
  const ops = await login(USERS.nwOps);
  const p = await call('POST', '/console/products', {
    token: ops,
    body: { name: 'QA should not exist', sku: 'QA-RBAC-1', storeId: '01M4GJR33TNYGMMZX7KFHQBZR1' },
  });
  assert.equal(p.status, 403, `product create -> ${p.status}`);
  const c = await call('POST', '/console/coupons', { token: ops, body: { code: 'QARBAC1', discountType: 'PERCENTAGE', discountValue: '5' } });
  assert.equal(c.status, 403, `coupon create -> ${c.status}`);
});

test('[RBAC-007] public endpoints stay public: /plans and /website/content need no token', async () => {
  assert.equal((await call('GET', '/plans')).status, 200);
  assert.equal((await call('GET', '/website/content')).status, 200);
});

test('[RBAC-008] impersonation is super-admin only', async () => {
  const token = await login(USERS.nwOwner);
  const r = await call('POST', '/platform/tenants/1/impersonate', { token });
  assert.equal(r.status, 403);
});
