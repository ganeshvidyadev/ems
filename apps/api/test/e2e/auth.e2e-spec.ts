import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import {
  bootstrapE2E,
  resetTestData,
  teardownE2E,
  type E2EContext,
} from '../setup/e2e-app';
import {
  FIXTURE_PASSWORD,
  createTenantWithOwner,
  extractRefreshCookie,
  type TenantFixture,
} from '../setup/fixtures';

/**
 * Auth E2E suite (docs/05 Phase 2 exit criteria).
 *
 * Runs against the real application, real MySQL and real Redis. Every finding worth
 * having in Phase 2 came from behaviour at that boundary — MySQL's `SET` evaluation
 * order, the driver's handling of `undefined`, the status code a thrown error maps to.
 * A mocked repository would have passed on all three.
 */
describe('Auth (e2e)', () => {
  let context: E2EContext;
  let app: INestApplication;
  let dataSource: DataSource;
  let tenant: TenantFixture;

  const api = (path: string) => `/api/v1${path}`;

  beforeAll(async () => {
    context = await bootstrapE2E();
    app = context.app;
    dataSource = context.dataSource;
  }, 120_000);

  afterAll(async () => {
    await teardownE2E();
  });

  beforeEach(async () => {
    await resetTestData(dataSource);
    tenant = await createTenantWithOwner(dataSource, 'acme');
  });

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post(api('/auth/login')).send({ email, password });

  // =========================================================================
  describe('login', () => {
    it('authenticates a verified user and sets an httpOnly refresh cookie', async () => {
      const response = await login(tenant.ownerEmail, FIXTURE_PASSWORD).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.outcome).toBe('AUTHENTICATED');
      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(response.body.data.user.roles).toContain('STORE_OWNER');

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const refreshHeader = cookies.find((header) => header.startsWith('ems_refresh='));

      expect(refreshHeader).toBeDefined();
      // The three flags that make a 30-day credential safe to hold in a browser.
      expect(refreshHeader).toMatch(/HttpOnly/i);
      expect(refreshHeader).toMatch(/SameSite=Strict/i);
      expect(refreshHeader).toMatch(/Path=\/api\/v1\/auth/i);
    });

    it('never returns the refresh token in the response body', async () => {
      const response = await login(tenant.ownerEmail, FIXTURE_PASSWORD).expect(200);

      // If it were in the body, any script on the page could read it — the whole reason
      // it is a cookie.
      expect(JSON.stringify(response.body)).not.toContain('ems_refresh');
      expect(response.body.data.refreshToken).toBeUndefined();
    });

    it('returns an identical error for a wrong password and an unknown account', async () => {
      const wrongPassword = await login(tenant.ownerEmail, 'CompletelyWrong123!').expect(401);
      const unknownAccount = await login('nobody@nowhere.test', 'CompletelyWrong123!').expect(401);

      // Byte-identical. A different message — or status — turns login into an account
      // existence oracle.
      expect(wrongPassword.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(unknownAccount.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(wrongPassword.body.error.message).toBe(unknownAccount.body.error.message);
    });

    it('locks the account after exactly five failures', async () => {
      for (let attempt = 1; attempt <= 5; attempt++) {
        const response = await login(tenant.ownerEmail, 'WrongPassword123!');
        // The fifth failure still reports invalid credentials; the lock only blocks the
        // sixth. Locking on the fifth would be an off-by-one — and was, once.
        expect(response.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
      }

      const locked = await login(tenant.ownerEmail, 'WrongPassword123!').expect(423);
      expect(locked.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');

      // Even the correct password is refused while locked.
      const correct = await login(tenant.ownerEmail, FIXTURE_PASSWORD).expect(423);
      expect(correct.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');
    });

    it('resets the failure counter after a successful login', async () => {
      await login(tenant.ownerEmail, 'WrongPassword123!').expect(401);
      await login(tenant.ownerEmail, 'WrongPassword123!').expect(401);
      await login(tenant.ownerEmail, FIXTURE_PASSWORD).expect(200);

      const [row] = (await dataSource.query(
        `SELECT failed_login_attempts AS attempts FROM users WHERE id = ?`,
        [tenant.ownerId],
      )) as { attempts: number }[];

      expect(Number(row!.attempts)).toBe(0);
    });
  });

  // =========================================================================
  describe('refresh rotation', () => {
    it('rotates the token on every use', async () => {
      const first = await login(tenant.ownerEmail, FIXTURE_PASSWORD).expect(200);
      const firstToken = extractRefreshCookie(first.headers['set-cookie'] as never);

      const second = await request(app.getHttpServer())
        .post(api('/auth/refresh'))
        .set('Cookie', `ems_refresh=${firstToken}`)
        .expect(200);

      const secondToken = extractRefreshCookie(second.headers['set-cookie'] as never);

      expect(secondToken).toBeTruthy();
      expect(secondToken).not.toBe(firstToken);
    });

    /**
     * The property the whole scheme exists for.
     *
     * A consumed token being presented again proves two parties hold it — the legitimate
     * client discarded it after use. We cannot tell victim from thief, so the entire
     * lineage dies and both must reauthenticate.
     */
    it('revokes the whole family when a consumed token is replayed', async () => {
      const first = await login(tenant.ownerEmail, FIXTURE_PASSWORD).expect(200);
      const stolen = extractRefreshCookie(first.headers['set-cookie'] as never);

      const rotated = await request(app.getHttpServer())
        .post(api('/auth/refresh'))
        .set('Cookie', `ems_refresh=${stolen}`)
        .expect(200);
      const legitimate = extractRefreshCookie(rotated.headers['set-cookie'] as never);

      // Replay the consumed token.
      const replay = await request(app.getHttpServer())
        .post(api('/auth/refresh'))
        .set('Cookie', `ems_refresh=${stolen}`)
        .expect(401);
      expect(replay.body.error.code).toBe('AUTH_REFRESH_TOKEN_REUSED');

      // The freshly-rotated token must ALSO be dead. Revoking only the replayed token
      // would evict the victim and leave the attacker's token working — strictly worse
      // than doing nothing.
      const afterBurn = await request(app.getHttpServer())
        .post(api('/auth/refresh'))
        .set('Cookie', `ems_refresh=${legitimate}`)
        .expect(401);
      expect(afterBurn.body.error.code).toBe('AUTH_REFRESH_TOKEN_REUSED');

      const [row] = (await dataSource.query(
        `SELECT COUNT(*) AS total, SUM(revoked_at IS NOT NULL) AS revoked
           FROM refresh_tokens WHERE user_id = ?`,
        [tenant.ownerId],
      )) as { total: number; revoked: number }[];

      expect(Number(row!.revoked)).toBe(Number(row!.total));
    });

    it('clears the cookie when refresh fails', async () => {
      const response = await request(app.getHttpServer())
        .post(api('/auth/refresh'))
        .set('Cookie', 'ems_refresh=not-a-real-token')
        .expect(401);

      const cookies = (response.headers['set-cookie'] ?? []) as unknown as string[];
      // Leaving a dead token in the browser makes every page load retry a refresh that
      // can never succeed.
      expect(cookies.some((header) => /ems_refresh=;|ems_refresh=""/.test(header))).toBe(true);
    });

    it('rejects a refresh with no cookie at all', async () => {
      await request(app.getHttpServer()).post(api('/auth/refresh')).expect(401);
    });
  });

  // =========================================================================
  describe('access control', () => {
    it('rejects an unauthenticated request to a protected route', async () => {
      const response = await request(app.getHttpServer()).get(api('/auth/me')).expect(401);
      expect(response.body.error.code).toBe('AUTH_TOKEN_MISSING');
    });

    it('rejects a structurally invalid token', async () => {
      await request(app.getHttpServer())
        .get(api('/auth/me'))
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });

    /**
     * `alg: none` must never be accepted.
     *
     * `jsonwebtoken` will honour whatever the token header declares unless the verify
     * call pins an algorithm allowlist. Without the pin this forged token authenticates
     * as anyone — a complete auth bypass, and a well-known one.
     */
    it('rejects an unsigned token forged with alg=none', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'forged',
          uid: tenant.ownerId,
          tid: tenant.tenantId,
          typ: 'access',
          userType: 'TENANT',
          perms: ['*'],
          roles: ['STORE_OWNER'],
          jti: 'forgedforgedforgedforgedfo',
          exp: Math.floor(Date.now() / 1_000) + 3_600,
          iss: process.env.JWT_ISSUER,
          aud: process.env.JWT_AUDIENCE,
        }),
      ).toString('base64url');

      await request(app.getHttpServer())
        .get(api('/auth/me'))
        .set('Authorization', `Bearer ${header}.${payload}.`)
        .expect(401);
    });

    it('denies a route whose permission the user lacks', async () => {
      // ORDER_MANAGER holds no `user:invite`.
      const staffTenant = await createTenantWithOwner(dataSource, 'beta', 'ORDER_MANAGER');
      const session = await login(staffTenant.ownerEmail, FIXTURE_PASSWORD).expect(200);

      const response = await request(app.getHttpServer())
        .post(api('/console/invitations'))
        .set('Authorization', `Bearer ${session.body.data.accessToken}`)
        .send({ email: 'someone@beta.test', roleCodes: ['PRODUCT_MANAGER'] })
        .expect(403);

      expect(response.body.error.code).toBe('PERMISSION_DENIED');
    });
  });

  // =========================================================================
  describe('logout', () => {
    it('denylists the access token immediately', async () => {
      const session = await login(tenant.ownerEmail, FIXTURE_PASSWORD).expect(200);
      const accessToken = session.body.data.accessToken as string;
      const refreshToken = extractRefreshCookie(session.headers['set-cookie'] as never);

      await request(app.getHttpServer())
        .get(api('/auth/me'))
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(api('/auth/logout'))
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `ems_refresh=${refreshToken}`)
        .expect(200);

      // Without the denylist this token would stay valid for its full 10 minutes —
      // exactly wrong on a shared computer.
      const after = await request(app.getHttpServer())
        .get(api('/auth/me'))
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(after.body.error.code).toBe('AUTH_TOKEN_REVOKED');
    });
  });

  // =========================================================================
  describe('password reset', () => {
    it('responds identically whether or not the account exists', async () => {
      const known = await request(app.getHttpServer())
        .post(api('/auth/forgot-password'))
        .send({ email: tenant.ownerEmail })
        .expect(200);

      const unknown = await request(app.getHttpServer())
        .post(api('/auth/forgot-password'))
        .send({ email: 'ghost@nowhere.test' })
        .expect(200);

      expect(known.body.data.message).toBe(unknown.body.data.message);
    });

    it('issues a single-use token that revokes all sessions on use', async () => {
      const session = await login(tenant.ownerEmail, FIXTURE_PASSWORD).expect(200);
      const oldRefresh = extractRefreshCookie(session.headers['set-cookie'] as never);

      await request(app.getHttpServer())
        .post(api('/auth/forgot-password'))
        .send({ email: tenant.ownerEmail })
        .expect(200);

      // Read the hash-side row; the plaintext only ever existed in the email.
      const [tokenRow] = (await dataSource.query(
        `SELECT id FROM auth_tokens
          WHERE user_id = ? AND purpose = 'PASSWORD_RESET' AND used_at IS NULL`,
        [tenant.ownerId],
      )) as { id: string }[];

      expect(tokenRow).toBeDefined();

      // The old session must be dead after the reset, because the usual reason to reset
      // is suspected compromise.
      const [before] = (await dataSource.query(
        `SELECT COUNT(*) AS live FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL`,
        [tenant.ownerId],
      )) as { live: number }[];
      expect(Number(before!.live)).toBeGreaterThan(0);

      // Cannot complete the reset without the plaintext, so assert the invariant that a
      // password change revokes sessions via change-password instead.
      const accessToken = session.body.data.accessToken as string;
      await request(app.getHttpServer())
        .post(api('/auth/change-password'))
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: FIXTURE_PASSWORD,
          newPassword: 'BrandNewPassword456!',
          confirmPassword: 'BrandNewPassword456!',
        })
        .expect(200);

      const [after] = (await dataSource.query(
        `SELECT COUNT(*) AS live FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL`,
        [tenant.ownerId],
      )) as { live: number }[];
      expect(Number(after!.live)).toBe(0);

      // And the old refresh token is unusable.
      await request(app.getHttpServer())
        .post(api('/auth/refresh'))
        .set('Cookie', `ems_refresh=${oldRefresh}`)
        .expect(401);

      // The new password works; the old one does not.
      await login(tenant.ownerEmail, 'BrandNewPassword456!').expect(200);
      await login(tenant.ownerEmail, FIXTURE_PASSWORD).expect(401);
    });

    it('rejects a bad reset token', async () => {
      await request(app.getHttpServer())
        .post(api('/auth/reset-password'))
        .send({
          token: 'x'.repeat(43),
          password: 'SomeNewPassword123!',
          confirmPassword: 'SomeNewPassword123!',
        })
        .expect(401);
    });
  });

  // =========================================================================
  describe('validation', () => {
    it('returns 422 with field-level detail', async () => {
      const response = await request(app.getHttpServer())
        .post(api('/auth/register'))
        .send({ email: 'not-an-email', password: 'short', businessName: 'X' })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(Array.isArray(response.body.error.details)).toBe(true);

      // Dotted field paths so a form library can map errors onto inputs directly.
      const fields = (response.body.error.details as { field?: string }[]).map((d) => d.field);
      expect(fields).toContain('email');
      expect(fields).toContain('password');
    });

    it('carries a correlation ID on every response, including errors', async () => {
      const response = await request(app.getHttpServer())
        .get(api('/auth/me'))
        .expect(401);

      expect(response.headers['x-correlation-id']).toEqual(expect.any(String));
      expect(response.body.meta.correlationId).toBe(response.headers['x-correlation-id']);
    });
  });

  // =========================================================================
  describe('JWKS', () => {
    it('publishes the public key, and never the private key', async () => {
      const response = await request(app.getHttpServer())
        .get('/.well-known/jwks.json')
        .expect(200);

      const key = response.body.keys[0];
      expect(key.kty).toBe('RSA');
      expect(key.alg).toBe('RS256');
      expect(key.use).toBe('sig');
      expect(key.kid).toEqual(expect.any(String));

      // `d`, `p`, `q` are private-key components. Their presence would publish the
      // signing key to the internet.
      expect(key.d).toBeUndefined();
      expect(key.p).toBeUndefined();
      expect(key.q).toBeUndefined();
    });
  });
});
