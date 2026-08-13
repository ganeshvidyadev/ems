import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { ALLOW_ONBOARDING_KEY, IS_PUBLIC_KEY } from '../decorators';
import { SubscriptionPastDueError, TenantSuspendedError } from '../errors/api.errors';
import { CacheService } from '../services/cache.service';
import { RequestContextService } from '../services/request-context.service';

interface TenantStatusRow {
  status: string;
  suspensionReason: string | null;
  planCode: string | null;
}

/** Methods treated as writes. HEAD/OPTIONS are reads; everything else mutates. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Gates requests on the tenant's lifecycle state.
 *
 * The important nuance is that `PAST_DUE` is **read-only, not blocked**. Taking a
 * paying merchant's storefront offline over one failed card retry costs them revenue
 * and costs us the account; blocking *writes* is a strong enough prompt to pay while
 * their customers can still browse and their data stays reachable. `SUSPENDED` — a
 * deliberate admin action, usually for abuse — blocks everything.
 *
 * Status is cached for 60 seconds. A suspension therefore takes up to a minute to bite,
 * which is an accepted trade against a tenant lookup on every single request; anything
 * needing instant effect (an abuse takedown) also revokes tokens.
 */
@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
    private readonly context: RequestContextService,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    if (executionContext.getType() !== 'http') return true;

    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        executionContext.getHandler(),
        executionContext.getClass(),
      ])
    ) {
      return true;
    }

    const tenantId = this.context.tenantId;
    // No tenant means a platform route or system work — neither is gated by a
    // tenant's billing state.
    if (!tenantId) return true;

    const status = await this.loadStatus(tenantId);
    if (!status) return true;

    const request = executionContext.switchToHttp().getRequest<Request>();
    const isWrite = WRITE_METHODS.has(request.method);

    switch (status.status) {
      case 'ACTIVE':
      case 'TRIAL':
        return true;

      case 'PAST_DUE':
        if (isWrite) {
          throw new SubscriptionPastDueError(
            `${this.consoleBillingUrl()}?tenant=${tenantId}`,
          );
        }
        return true;

      case 'SUSPENDED':
        throw new TenantSuspendedError(status.suspensionReason);

      case 'PENDING':
      case 'PROVISIONING': {
        // Onboarding routes are exempt. Choosing a plan is the write that *starts*
        // provisioning, so blocking it here deadlocks every new signup — the tenant can
        // never leave PENDING because the only action that would move it is refused.
        const allowedDuringOnboarding = this.reflector.getAllAndOverride<boolean>(
          ALLOW_ONBOARDING_KEY,
          [executionContext.getHandler(), executionContext.getClass()],
        );
        if (allowedDuringOnboarding) return true;

        // Everything else stays blocked: a write against a store the saga is still
        // building would race it.
        if (isWrite) {
          throw new TenantSuspendedError('This store is still being set up');
        }
        return true;
      }

      case 'CANCELLED':
      case 'DELETED':
        throw new TenantSuspendedError('This store is no longer active');

      default:
        return true;
    }
  }

  private async loadStatus(tenantId: string): Promise<TenantStatusRow | null> {
    const cacheKey = `tenant:status:${tenantId}`;

    const cached = await this.cache.get<TenantStatusRow>(cacheKey);
    if (cached) {
      this.context.patch({ tenantStatus: cached.status, planCode: cached.planCode });
      return cached;
    }

    const rows = (await this.dataSource.query(
      `SELECT t.status              AS status,
              t.suspension_reason   AS suspensionReason,
              NULL                  AS planCode
         FROM tenants t
        WHERE t.id = ? AND t.deleted_at IS NULL
        LIMIT 1`,
      [tenantId],
    )) as TenantStatusRow[];

    const row = rows[0] ?? null;
    if (row) {
      await this.cache.set(cacheKey, row, 60);
      this.context.patch({ tenantStatus: row.status, planCode: row.planCode });
    }

    return row;
  }

  private consoleBillingUrl(): string {
    return '/settings/billing';
  }
}
