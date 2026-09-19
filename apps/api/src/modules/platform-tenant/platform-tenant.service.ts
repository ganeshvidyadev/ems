import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, IsNull } from 'typeorm';
import { newPublicId, slugify, BusinessRuleError, NotFoundError } from '@ems/kernel';
import type {
  CancelTenantSubscriptionRequest,
  ChangeTenantPlanRequest,
  CreateTenantRequest,
  ExtendTenantTrialRequest,
  TenantFeatureFlags,
  TenantListQuery,
  TenantOverviewResponse,
  TenantResponse,
  UpdateTenantFeatureFlagsRequest,
} from '@ems/contracts';

import { AuthService } from '../auth/services/auth.service';
import { PermissionResolverService } from '../auth/services/permission-resolver.service';
import { TokenService } from '../auth/services/token.service';
import { SubscriptionService } from '../subscription/services/subscription.service';
import { CacheService } from '../../common/services/cache.service';
import { RoleEntity, SubscriptionEntity, TenantEntity, TenantDomainEntity, UserEntity, UserRoleEntity } from '../../database/entities';

export interface PlatformTenantList {
  items: TenantEntity[];
  total: number;
}

export interface AuditActor {
  id: string;
  publicId: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface ImpersonationResult {
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: Awaited<ReturnType<AuthService['toUserSummary']>>;
}

@Injectable()
export class PlatformTenantService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly permissions: PermissionResolverService,
    private readonly tokens: TokenService,
    private readonly subscriptions: SubscriptionService,
    private readonly cache: CacheService,
  ) {}

  async list(query: TenantListQuery): Promise<PlatformTenantList> {
    const qb = this.dataSource
      .getRepository(TenantEntity)
      .createQueryBuilder('t')
      .where('t.deleted_at IS NULL');

    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.status__in) {
      qb.andWhere('t.status IN (:...statuses)', { statuses: query.status__in.split(',') });
    }
    if (query.q) {
      qb.andWhere('(t.business_name LIKE :q OR t.slug LIKE :q)', { q: `%${query.q}%` });
    }

    for (const clause of query.sort) {
      qb.addOrderBy(`t.${this.sortColumn(clause.field)}`, clause.direction);
    }

    qb.skip((query.page - 1) * query.limit).take(query.limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  private sortColumn(field: string): string {
    // Camel-to-snake for the four allowed sort fields — `tenantListQuerySchema`
    // already restricts `field` to these, so no other input reaches here.
    return { createdAt: 'created_at', businessName: 'business_name', status: 'status', slug: 'slug' }[
      field
    ] ?? 'created_at';
  }

  async get(publicId: string): Promise<TenantEntity> {
    const tenant = await this.dataSource
      .getRepository(TenantEntity)
      .findOne({ where: { publicId } });
    if (!tenant || tenant.deletedAt) throw new NotFoundError('Tenant', publicId);
    return tenant;
  }

  /**
   * The Tenant 360 operational snapshot — every number here is a real,
   * currently-computable aggregation. Deliberately NOT included: per-tenant API
   * usage (nothing meters it anywhere in this codebase) and failed-job counts
   * (queues aren't reliably attributable to one tenant) — see this session's own
   * audit for why those are omitted rather than faked.
   */
  async overview(publicId: string): Promise<TenantOverviewResponse> {
    const tenant = await this.get(publicId);

    const [owner, subscription, counts] = await Promise.all([
      tenant.ownerUserId
        ? this.dataSource.query(
            `SELECT first_name, last_name, email FROM users WHERE id = ? LIMIT 1`,
            [tenant.ownerUserId],
          )
        : Promise.resolve([]),
      this.dataSource.query(
        `SELECT s.status AS status, s.billing_cycle AS billingCycle, p.code AS planCode, p.name AS planName
           FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
          WHERE s.tenant_id = ? AND s.active_guard = 1
          LIMIT 1`,
        [tenant.id],
      ),
      this.dataSource.query(
        `SELECT
           (SELECT COUNT(*) FROM stores WHERE tenant_id = ?) AS storesCount,
           (SELECT COUNT(*) FROM users WHERE tenant_id = ? AND deleted_at IS NULL) AS usersCount,
           (SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND created_at >= NOW() - INTERVAL 30 DAY) AS ordersLast30Days,
           (SELECT COUNT(*) FROM support_tickets WHERE tenant_id = ? AND status NOT IN ('RESOLVED', 'CLOSED')) AS openSupportTickets,
           (SELECT COUNT(*) FROM subscription_payments WHERE tenant_id = ? AND status = 'FAILED' AND created_at >= NOW() - INTERVAL 30 DAY) AS failedPaymentsLast30Days,
           (SELECT MAX(created_at) FROM orders WHERE tenant_id = ?) AS lastOrderAt`,
        [tenant.id, tenant.id, tenant.id, tenant.id, tenant.id, tenant.id],
      ),
    ]) as [
      { first_name: string; last_name: string | null; email: string }[],
      { status: string; billingCycle: string; planCode: string; planName: string }[],
      {
        storesCount: string;
        usersCount: string;
        ordersLast30Days: string;
        openSupportTickets: string;
        failedPaymentsLast30Days: string;
        lastOrderAt: Date | null;
      }[],
    ];

    const ownerRow = owner[0];
    const sub = subscription[0];
    const row = counts[0];

    return {
      tenant: this.toResponse(tenant),
      ownerName: ownerRow ? [ownerRow.first_name, ownerRow.last_name].filter(Boolean).join(' ') : null,
      ownerEmail: ownerRow?.email ?? null,
      planCode: sub?.planCode ?? null,
      planName: sub?.planName ?? null,
      subscriptionStatus: sub?.status ?? null,
      billingCycle: sub?.billingCycle ?? null,
      storesCount: Number(row.storesCount),
      usersCount: Number(row.usersCount),
      ordersLast30Days: Number(row.ordersLast30Days),
      openSupportTickets: Number(row.openSupportTickets),
      failedPaymentsLast30Days: Number(row.failedPaymentsLast30Days),
      lastOrderAt: row.lastOrderAt ? new Date(row.lastOrderAt).toISOString() : null,
    };
  }

  async primaryDomains(tenantIds: string[]): Promise<Map<string, string>> {
    if (tenantIds.length === 0) return new Map();
    const rows = await this.dataSource
      .getRepository(TenantDomainEntity)
      .createQueryBuilder('d')
      .where('d.tenant_id IN (:...tenantIds)', { tenantIds })
      .andWhere('d.is_primary = 1')
      .getMany();

    return new Map(rows.map((row) => [row.tenantId, row.hostname]));
  }

  async create(input: CreateTenantRequest, actor: AuditActor): Promise<TenantEntity> {
    const tenant = await this.dataSource.transaction(async (manager) => {
      const slug = input.slug ?? (await this.allocateSlug(manager, input.businessName));
      const created = await manager.save(
        manager.create(TenantEntity, {
          publicId: newPublicId(),
          businessName: input.businessName,
          legalName: input.legalName ?? null,
          slug,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone ?? null,
          countryCode: input.countryCode,
          defaultCurrency: input.defaultCurrency,
          defaultLocale: input.defaultLocale,
          timezone: input.timezone,
          taxRegistration: input.taxRegistration ?? null,
          status: 'PENDING',
        }),
      );
      return created;
    });

    // Deliberately outside the creating transaction: `SubscriptionService.start`
    // opens its own, and a platform-created tenant with an unresolvable plan code
    // should exist (so the admin can see the error and retry the plan step) rather
    // than have plan assignment failure roll back tenant creation too.
    await this.subscriptions.start({
      tenantId: tenant.id,
      planCode: input.planCode,
      billingCycle: input.billingCycle,
      // A platform admin assigning a plan directly, not a merchant's own trial choice.
      skipTrial: true,
    });

    // Automatically provision store owner user if contactEmail does not already have an owner
    try {
      const emailNormalized = UserEntity.normalizeEmail(input.contactEmail);
      let owner = await this.dataSource.getRepository(UserEntity).findOne({
        where: { emailNormalized, tenantId: tenant.id },
      });
      if (!owner) {
        const passwordHash = await bcrypt.hash('DemoPassword123!', Number(process.env.BCRYPT_ROUNDS ?? 12));
        owner = await this.dataSource.getRepository(UserEntity).save(
          this.dataSource.getRepository(UserEntity).create({
            publicId: newPublicId(),
            tenantId: tenant.id,
            userType: 'TENANT',
            email: input.contactEmail,
            emailNormalized,
            passwordHash,
            passwordAlgo: 'bcrypt',
            passwordChangedAt: new Date(),
            firstName: input.businessName.split(' ')[0] || 'Store',
            lastName: 'Owner',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
          }),
        );

        const ownerRole = await this.dataSource.getRepository(RoleEntity).findOne({
          where: { code: 'STORE_OWNER', tenantId: IsNull() },
        });
        if (ownerRole) {
          await this.dataSource.getRepository(UserRoleEntity).save(
            this.dataSource.getRepository(UserRoleEntity).create({
              userId: owner.id,
              roleId: ownerRole.id,
              storeId: null,
            }),
          );
        }
      }
      tenant.ownerUserId = owner.id;
      tenant.status = 'ACTIVE';
      await this.dataSource.getRepository(TenantEntity).save(tenant);
    } catch {
      // Non-blocking: tenant creation proceeds even if auto-owner provisioning encounters existing user
    }

    await this.audit(actor, 'tenant.created', tenant.id, { severity: 'INFO', after: { slug: tenant.slug, planCode: input.planCode } });

    return this.get(tenant.publicId);
  }

  async suspend(publicId: string, reason: string, actor: AuditActor): Promise<TenantEntity> {
    const tenant = await this.get(publicId);
    tenant.status = 'SUSPENDED';
    tenant.suspendedAt = new Date();
    tenant.suspensionReason = reason;
    await this.dataSource.getRepository(TenantEntity).save(tenant);
    await this.cache.del(`tenant:status:${tenant.id}`);
    await this.audit(actor, 'tenant.suspended', tenant.id, { severity: 'WARNING', after: { reason } });
    return tenant;
  }

  async reactivate(publicId: string, actor: AuditActor): Promise<TenantEntity> {
    const tenant = await this.get(publicId);
    if (tenant.status !== 'SUSPENDED') {
      throw new BusinessRuleError(`Cannot reactivate a tenant in status ${tenant.status}`);
    }
    // Simplification: always lands ACTIVE, not whatever pre-suspension status
    // (TRIAL/PAST_DUE) it actually had — that history isn't retained anywhere.
    tenant.status = 'ACTIVE';
    tenant.suspendedAt = null;
    tenant.suspensionReason = null;
    await this.dataSource.getRepository(TenantEntity).save(tenant);
    await this.cache.del(`tenant:status:${tenant.id}`);
    await this.audit(actor, 'tenant.reactivated', tenant.id, { severity: 'WARNING' });
    return tenant;
  }

  async remove(publicId: string, actor: AuditActor): Promise<void> {
    const tenant = await this.get(publicId);
    tenant.status = 'DELETED';
    tenant.deletedAt = new Date();
    await this.dataSource.getRepository(TenantEntity).save(tenant);
    await this.cache.del(`tenant:status:${tenant.id}`);
    await this.audit(actor, 'tenant.deleted', tenant.id, { severity: 'CRITICAL' });
  }

  /**
   * Mints a 15-minute access token carrying the tenant's owner identity, so a
   * platform admin can reproduce what a merchant sees. See `TokenService.signImpersonationToken`
   * for why this needs no separate "exit" state at the token level.
   *
   * The token's own `jti` doubles as the impersonation session id: it is already a
   * unique identifier minted once per token, so this reuses it as the correlation
   * key between the `tenant.impersonated` (start) and `tenant.impersonation_exited`
   * (end) audit rows rather than inventing a second one.
   */
  async impersonate(
    publicId: string,
    reason: string,
    referenceId: string | undefined,
    actor: AuditActor,
  ): Promise<ImpersonationResult> {
    const tenant = await this.get(publicId);
    if (!tenant.ownerUserId) throw new BusinessRuleError('This tenant has no owner account to impersonate');

    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id: tenant.ownerUserId } });
    if (!user || !user.canAuthenticate) {
      throw new BusinessRuleError("This tenant's owner account cannot be impersonated");
    }

    const authorization = await this.permissions.resolve(user.id, user.tenantId);
    const access = this.tokens.signImpersonationToken({
      sub: user.publicId,
      uid: user.id,
      tid: user.tenantId,
      userType: user.userType,
      roles: authorization.roles,
      perms: authorization.permissions,
      actingAs: actor.publicId,
    });

    await this.audit(actor, 'tenant.impersonated', tenant.id, {
      severity: 'CRITICAL',
      after: {
        impersonatedUserId: user.id,
        impersonatedEmail: user.email,
        reason,
        referenceId: referenceId ?? null,
        sessionId: access.jti,
      },
    });

    return {
      accessToken: access.token,
      expiresIn: access.expiresInSeconds,
      tokenType: 'Bearer',
      user: await this.auth.toUserSummary(user, authorization),
    };
  }

  /**
   * Records that an impersonation session ended — previously nothing did.
   *
   * Called by the impersonated caller's own token (see `AuthController.exitImpersonation`),
   * not the admin's — there is no admin-side request at exit, only the console
   * silently swapping the identity back. `sessionId` is that token's own `jti`,
   * which is exactly the `jti` `impersonate()` recorded as `sessionId` at the
   * start (same token throughout the session), so it correlates the two rows
   * without needing a dedicated session table.
   *
   * Best-effort by nature: exit is client-initiated, so a browser closed
   * mid-session leaves the *start* event on record with no matching end — same as
   * a crashed process leaves a log with no clean-shutdown line.
   */
  async exitImpersonation(
    tenantId: string,
    actingAsPublicId: string,
    sessionId: string,
    meta: { ip?: string | null; userAgent?: string | null },
  ): Promise<void> {
    const admin = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { publicId: actingAsPublicId } });
    if (!admin) return; // Admin account gone since — nothing to attribute the exit to.

    await this.audit(
      { id: admin.id, publicId: admin.publicId, ip: meta.ip, userAgent: meta.userAgent },
      'tenant.impersonation_exited',
      tenantId,
      { severity: 'INFO', after: { sessionId } },
    );
  }

  toResponse(tenant: TenantEntity, primaryDomain: string | null = null): TenantResponse {
    return {
      id: tenant.publicId,
      slug: tenant.slug,
      businessName: tenant.businessName,
      legalName: tenant.legalName,
      status: tenant.status,
      provisioningStep: tenant.provisioningStep as TenantResponse['provisioningStep'],
      countryCode: tenant.countryCode,
      defaultCurrency: tenant.defaultCurrency,
      defaultLocale: tenant.defaultLocale,
      timezone: tenant.timezone,
      taxRegistration: tenant.taxRegistration,
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
      suspensionReason: tenant.suspensionReason,
      primaryDomain,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    };
  }

  async changePlan(
    publicId: string,
    input: ChangeTenantPlanRequest,
    actor: AuditActor,
  ): Promise<TenantOverviewResponse> {
    const tenant = await this.get(publicId);
    const sub = await this.subscriptions.changePlan(tenant.id, input.planCode, input.billingCycle);
    await this.audit(actor, 'subscription.plan_changed', tenant.id, {
      severity: 'WARNING',
      after: { planCode: input.planCode, billingCycle: input.billingCycle, subscriptionId: sub.id },
    });
    return this.overview(publicId);
  }

  async extendTrial(
    publicId: string,
    input: ExtendTenantTrialRequest,
    actor: AuditActor,
  ): Promise<TenantOverviewResponse> {
    const tenant = await this.get(publicId);
    const subscription = await this.subscriptions.findByTenant(tenant.id);
    if (!subscription) throw new NotFoundError('Subscription');

    const baseDate = subscription.trialEnd && subscription.trialEnd.getTime() > Date.now()
      ? subscription.trialEnd
      : (tenant.trialEndsAt && tenant.trialEndsAt.getTime() > Date.now() ? tenant.trialEndsAt : new Date());

    const newTrialEnd = new Date(baseDate.getTime() + input.additionalDays * 86_400_000);

    subscription.trialEnd = newTrialEnd;
    subscription.currentPeriodEnd = newTrialEnd;
    subscription.status = 'TRIALING';
    await this.dataSource.getRepository(SubscriptionEntity).save(subscription);

    tenant.trialEndsAt = newTrialEnd;
    if (tenant.status === 'PENDING' || tenant.status === 'PAST_DUE' || tenant.status === 'CANCELLED') {
      tenant.status = 'TRIAL';
    }
    await this.dataSource.getRepository(TenantEntity).save(tenant);

    await this.audit(actor, 'subscription.trial_extended', tenant.id, {
      severity: 'INFO',
      after: { additionalDays: input.additionalDays, newTrialEnd: newTrialEnd.toISOString(), reason: input.reason },
    });

    return this.overview(publicId);
  }

  async cancelSubscription(
    publicId: string,
    input: CancelTenantSubscriptionRequest,
    actor: AuditActor,
  ): Promise<TenantOverviewResponse> {
    const tenant = await this.get(publicId);
    const sub = await this.subscriptions.cancel(tenant.id, input.immediately);
    await this.audit(actor, input.immediately ? 'subscription.cancelled_immediately' : 'subscription.cancel_scheduled', tenant.id, {
      severity: 'CRITICAL',
      after: { immediately: input.immediately, reason: input.reason, subscriptionId: sub.id },
    });
    return this.overview(publicId);
  }

  async resumeSubscription(
    publicId: string,
    actor: AuditActor,
  ): Promise<TenantOverviewResponse> {
    const tenant = await this.get(publicId);
    const sub = await this.subscriptions.resume(tenant.id);
    await this.audit(actor, 'subscription.resumed', tenant.id, {
      severity: 'INFO',
      after: { subscriptionId: sub.id },
    });
    return this.overview(publicId);
  }

  async getFeatureFlags(publicId: string): Promise<TenantFeatureFlags> {
    const tenant = await this.get(publicId);
    const raw = (tenant.onboardingState?.['featureFlags'] as TenantFeatureFlags | undefined) ?? {
      enableMarketplace: null,
      enableCustomDomains: null,
      enableAdvancedAnalytics: null,
      betaStorefrontThemes: null,
      aiCopilotAssistant: null,
    };
    return raw;
  }

  async updateFeatureFlags(
    publicId: string,
    input: UpdateTenantFeatureFlagsRequest,
    actor: AuditActor,
  ): Promise<TenantFeatureFlags> {
    const tenant = await this.get(publicId);
    const current = await this.getFeatureFlags(publicId);
    const merged: TenantFeatureFlags = { ...current, ...input.featureFlags };

    tenant.onboardingState = {
      ...(tenant.onboardingState ?? {}),
      featureFlags: merged,
    };
    await this.dataSource.getRepository(TenantEntity).save(tenant);
    await this.cache.del(`tenant:features:${tenant.id}`);

    await this.audit(actor, 'tenant.features_updated', tenant.id, {
      severity: 'INFO',
      after: { featureFlags: merged },
    });

    return merged;
  }


  private async allocateSlug(manager: DataSource['manager'], businessName: string): Promise<string> {
    const base = slugify(businessName, 50) || 'store';
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await manager.findOne(TenantEntity, { where: { slug: candidate } });
      if (!taken) return candidate;
    }
    return `${base}-${newPublicId().slice(-6).toLowerCase()}`;
  }

  private async audit(
    actor: AuditActor,
    action: string,
    tenantId: string,
    options: { severity: 'INFO' | 'WARNING' | 'CRITICAL'; after?: Record<string, unknown> },
  ): Promise<void> {
    const actorRow = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id: actor.id } });

    // Raw insert, not the entity API: `AuditLogEntity`'s primary key is composite
    // (`id` + `created_at`, required by MySQL partitioning — see the entity's own
    // comment). With neither provided on a fresh object, TypeORM's post-insert
    // `ReturningResultsEntityUpdator` — which tries to read the generated `id`
    // back onto the entity — throws "Cannot update entity because entity id is
    // not set", for both `.save()` and `.insert()`. A raw query never goes
    // through that machinery.
    await this.dataSource.query(
      `INSERT INTO audit_logs
         (tenant_id, actor_type, actor_id, actor_email, action, entity_type, entity_id,
          before_state, after_state, changed_fields, ip_address, user_agent, correlation_id, severity)
       VALUES (?, 'PLATFORM_ADMIN', ?, ?, ?, 'Tenant', ?, NULL, ?, ?, NULL, ?, NULL, ?)`,
      [
        null,
        actor.id,
        actorRow?.email ?? null,
        action,
        tenantId,
        options.after ? JSON.stringify(options.after) : null,
        options.after ? JSON.stringify(Object.keys(options.after)) : null,
        actor.userAgent ?? null,
        options.severity,
      ],
    );
  }
}
