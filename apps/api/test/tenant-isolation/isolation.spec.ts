import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { CrossTenantAccessError } from '@ems/kernel';
import { bootstrapE2E, resetTestData, teardownE2E, type E2EContext } from '../setup/e2e-app';
import { FIXTURE_PASSWORD, createTenantWithOwner, type TenantFixture } from '../setup/fixtures';
import { RequestContextService } from '../../src/common/services/request-context.service';
import { UserInvitationEntity } from '../../src/database/entities';

/**
 * The tenant-isolation leakage suite — a **blocking CI gate** (docs/05 Phase 1/2).
 *
 * Two tenants are created with near-identical data, then every tenant-scoped surface is
 * attacked with tenant A's token against tenant B's resource ids. The expected result is
 * always **404, never 403**: a 403 confirms the resource exists, which lets an attacker
 * enumerate a competitor's ids (docs/04 §3).
 *
 * This suite has to exist and has to grow with every endpoint. Writing it later means
 * auditing hundreds of routes at once, which in practice never happens — and a single
 * missing `WHERE tenant_id` is a cross-tenant data breach.
 */
describe('Tenant isolation (leakage suite)', () => {
  let context: E2EContext;
  let app: INestApplication;
  let dataSource: DataSource;

  let alpha: TenantFixture;
  let beta: TenantFixture;
  let alphaToken: string;
  let betaToken: string;

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

    alpha = await createTenantWithOwner(dataSource, 'alpha');
    beta = await createTenantWithOwner(dataSource, 'beta');

    alphaToken = await loginAs(alpha.ownerEmail);
    betaToken = await loginAs(beta.ownerEmail);
  });

  async function loginAs(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ email, password: FIXTURE_PASSWORD })
      .expect(200);
    return response.body.data.accessToken as string;
  }

  // =========================================================================
  describe('token claims', () => {
    it('binds each token to its own tenant', async () => {
      const decode = (token: string) => {
        const payload = token.split('.')[1]!;
        return JSON.parse(
          Buffer.from(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '='), 'base64url').toString(),
        ) as { tid: string };
      };

      expect(decode(alphaToken).tid).toBe(alpha.tenantId);
      expect(decode(betaToken).tid).toBe(beta.tenantId);
      expect(decode(alphaToken).tid).not.toBe(decode(betaToken).tid);
    });
  });

  // =========================================================================
  describe('invitations', () => {
    it('lists only the caller’s own invitations', async () => {
      await createInvitation(alphaToken, 'hire@alpha.test');
      await createInvitation(betaToken, 'hire@beta.test');

      const alphaList = await request(app.getHttpServer())
        .get(api('/console/invitations'))
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(200);

      const emails = (alphaList.body.data as { email: string }[]).map((row) => row.email);

      expect(emails).toContain('hire@alpha.test');
      // The whole point: beta's invitation must be invisible, not merely unmodifiable.
      expect(emails).not.toContain('hire@beta.test');
    });

    it('returns 404 — not 403 — when revoking another tenant’s invitation', async () => {
      const betaInvitation = await createInvitation(betaToken, 'hire@beta.test');

      const response = await request(app.getHttpServer())
        .delete(api(`/console/invitations/${betaInvitation.id}`))
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(404);

      // 403 would confirm the id is real, which is itself the leak.
      expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');

      // And it must actually still be pending.
      const still = await dataSource
        .getRepository(UserInvitationEntity)
        .findOne({ where: { publicId: betaInvitation.id } });
      expect(still?.status).toBe('PENDING');
    });

    it('returns 404 when resending another tenant’s invitation', async () => {
      const betaInvitation = await createInvitation(betaToken, 'hire2@beta.test');

      await request(app.getHttpServer())
        .post(api(`/console/invitations/${betaInvitation.id}/resend`))
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(404);
    });
  });

  // =========================================================================
  describe('sessions', () => {
    it('lists only the caller’s own sessions', async () => {
      const alphaSessions = await request(app.getHttpServer())
        .get(api('/auth/sessions'))
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(200);

      expect(alphaSessions.body.data).toHaveLength(1);
      expect(alphaSessions.body.data[0].isCurrent).toBe(true);
    });

    it('returns 404 when revoking another user’s session', async () => {
      const betaSessions = await request(app.getHttpServer())
        .get(api('/auth/sessions'))
        .set('Authorization', `Bearer ${betaToken}`)
        .expect(200);

      const betaFamilyId = betaSessions.body.data[0].id as string;

      // Without an ownership check this would be a trivial denial of service: sign any
      // account out by guessing or observing a family id.
      await request(app.getHttpServer())
        .delete(api(`/auth/sessions/${betaFamilyId}`))
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(404);

      // Beta's session must still work.
      await request(app.getHttpServer())
        .get(api('/auth/me'))
        .set('Authorization', `Bearer ${betaToken}`)
        .expect(200);
    });
  });

  // =========================================================================
  describe('repository-level enforcement', () => {
    /**
     * Layer 2 (`TenantGuardSubscriber`) in isolation.
     *
     * The HTTP tests above prove the API filters correctly. This proves the *net* below
     * it also holds: even a query written without a tenant predicate cannot return
     * another tenant's row, because `afterLoad` refuses to hand it back.
     */
    it('throws when an entity is loaded under the wrong tenant context', async () => {
      const betaInvitation = await dataSource.getRepository(UserInvitationEntity).save(
        dataSource.getRepository(UserInvitationEntity).create({
          tenantId: beta.tenantId,
          email: 'direct@beta.test',
          emailNormalized: 'direct@beta.test',
          tokenHash: 'b'.repeat(64),
          roleIds: [],
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
      );

      const contextService = app.get(RequestContextService);

      // Deliberately unfiltered query, run while alpha is the active tenant.
      const attempt = contextService.run(
        {
          correlationId: 'isolation-test',
          tenantId: alpha.tenantId,
          surface: 'console',
          startedAt: Date.now(),
        },
        async () =>
          dataSource
            .getRepository(UserInvitationEntity)
            .findOne({ where: { id: betaInvitation.id } }),
      );

      await expect(attempt).rejects.toThrow(CrossTenantAccessError);
    });

    it('allows the same query under the correct tenant context', async () => {
      const alphaInvitation = await dataSource.getRepository(UserInvitationEntity).save(
        dataSource.getRepository(UserInvitationEntity).create({
          tenantId: alpha.tenantId,
          email: 'direct@alpha.test',
          emailNormalized: 'direct@alpha.test',
          tokenHash: 'a'.repeat(64),
          roleIds: [],
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
      );

      const contextService = app.get(RequestContextService);

      const found = await contextService.run(
        {
          correlationId: 'isolation-test',
          tenantId: alpha.tenantId,
          surface: 'console',
          startedAt: Date.now(),
        },
        async () =>
          dataSource
            .getRepository(UserInvitationEntity)
            .findOne({ where: { id: alphaInvitation.id } }),
      );

      // Guards against the opposite failure: enforcement so aggressive that legitimate
      // access breaks, which would push developers to bypass it.
      expect(found?.email).toBe('direct@alpha.test');
    });

    it('stamps tenant_id from context on insert', async () => {
      const contextService = app.get(RequestContextService);

      const saved = await contextService.run(
        {
          correlationId: 'isolation-test',
          tenantId: beta.tenantId,
          surface: 'console',
          startedAt: Date.now(),
        },
        async () => {
          const repository = dataSource.getRepository(UserInvitationEntity);
          // tenantId intentionally omitted — the subscriber must supply it.
          const entity = repository.create({
            email: 'stamped@beta.test',
            emailNormalized: 'stamped@beta.test',
            tokenHash: 'c'.repeat(64),
            roleIds: [],
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 86_400_000),
          });
          return repository.save(entity);
        },
      );

      expect(String(saved.tenantId)).toBe(beta.tenantId);
    });
  });

  // =========================================================================
  describe('database constraints', () => {
    it('allows the same email in two different tenants', async () => {
      // The doc's original key pair would have made this impossible, contradicting its
      // own stated intent — see the migration comment.
      const shared = 'shared.person@example.test';

      for (const tenant of [alpha, beta]) {
        await dataSource.query(
          `INSERT INTO users (public_id, tenant_id, user_type, email, email_normalized,
                              first_name, status, password_algo)
           VALUES (?, ?, 'TENANT', ?, ?, 'Shared', 'ACTIVE', 'bcrypt')`,
          [`01SHARED${tenant.slug.toUpperCase().padEnd(18, 'X')}`.slice(0, 26), tenant.tenantId, shared, shared],
        );
      }

      const [row] = (await dataSource.query(
        `SELECT COUNT(*) AS total FROM users WHERE email_normalized = ?`,
        [shared],
      )) as { total: number }[];

      expect(Number(row!.total)).toBe(2);
    });

    it('rejects a duplicate email within one tenant', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO users (public_id, tenant_id, user_type, email, email_normalized,
                              first_name, status, password_algo)
           VALUES ('01DUPEDUPEDUPEDUPEDUPEDUPE', ?, 'TENANT', ?, ?, 'Dupe', 'ACTIVE', 'bcrypt')`,
          [alpha.tenantId, alpha.ownerEmail, alpha.ownerEmail],
        ),
      ).rejects.toThrow(/Duplicate entry/i);
    });

    it('rejects a PLATFORM user that carries a tenant_id', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO users (public_id, tenant_id, user_type, email, email_normalized,
                              first_name, status, password_algo)
           VALUES ('01BADPLATFORMUSER000000000', ?, 'PLATFORM', 'bad@x.test', 'bad@x.test',
                   'Bad', 'ACTIVE', 'bcrypt')`,
          [alpha.tenantId],
        ),
      ).rejects.toThrow(/chk_users_tenant_correlation/i);
    });
  });

  // =========================================================================
  async function createInvitation(token: string, email: string): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post(api('/console/invitations'))
      .set('Authorization', `Bearer ${token}`)
      .send({ email, roleCodes: ['PRODUCT_MANAGER'] })
      .expect(201);

    return { id: response.body.data.id as string };
  }
});
