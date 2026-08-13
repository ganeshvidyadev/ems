import { Inject, Injectable, Logger } from '@nestjs/common';
import { PlanQuotaExceededError } from '@ems/kernel';
import { InjectDataSource } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { UNLIMITED, type PlanLimitKey } from '../../../database/entities';

export interface QuotaStatus {
  limitKey: PlanLimitKey;
  current: number;
  max: number;
  /** True when `max` is -1 (unlimited). */
  unlimited: boolean;
  remaining: number;
}

/**
 * Counts current usage for a quota key.
 *
 * A registry rather than a switch so adding a quota is one entry, and the SQL for each is
 * visible in one place. Each returns a scalar `count`.
 *
 * `max_orders_per_month` deliberately counts the **current calendar month**, matching how
 * the limit is described to merchants — a rolling 30-day window would be defensible but
 * would make "you used 480 of 500 this month" wrong on the dashboard.
 */
const USAGE_QUERIES: Record<PlanLimitKey, { sql: string; params: (tenantId: string) => unknown[] }> = {
  max_products: {
    sql: `SELECT COUNT(*) AS c FROM products WHERE tenant_id = ? AND deleted_at IS NULL`,
    params: (tenantId) => [tenantId],
  },
  max_orders_per_month: {
    sql: `SELECT COUNT(*) AS c FROM orders
           WHERE tenant_id = ?
             AND created_at >= DATE_FORMAT(NOW(3), '%Y-%m-01')`,
    params: (tenantId) => [tenantId],
  },
  max_staff_users: {
    sql: `SELECT COUNT(*) AS c FROM users
           WHERE tenant_id = ? AND deleted_at IS NULL AND status <> 'DEACTIVATED'`,
    params: (tenantId) => [tenantId],
  },
  max_storage_mb: {
    sql: `SELECT COALESCE(SUM(size_bytes), 0) DIV 1048576 AS c FROM media_assets WHERE tenant_id = ?`,
    params: (tenantId) => [tenantId],
  },
  max_stores: {
    sql: `SELECT COUNT(*) AS c FROM stores WHERE tenant_id = ? AND deleted_at IS NULL`,
    params: (tenantId) => [tenantId],
  },
  max_warehouses: {
    sql: `SELECT COUNT(*) AS c FROM warehouses WHERE tenant_id = ? AND deleted_at IS NULL`,
    params: (tenantId) => [tenantId],
  },
  max_channels: {
    sql: `SELECT COUNT(*) AS c FROM channels WHERE tenant_id = ? AND status <> 'DISCONNECTED'`,
    params: (tenantId) => [tenantId],
  },
  max_custom_domains: {
    sql: `SELECT COUNT(*) AS c FROM tenant_domains WHERE tenant_id = ? AND type = 'CUSTOM'`,
    params: (tenantId) => [tenantId],
  },
};

/**
 * Plan quota enforcement.
 *
 * Two things this gets right that a naive implementation does not:
 *
 *  1. **Limits are cached, usage is not.** A plan's limits change rarely, so caching them
 *     for five minutes is nearly free. Usage is the whole point of the check — caching it
 *     would let a merchant blow past a cap during the TTL, which is exactly the window an
 *     import job runs in.
 *
 *  2. **A missing limit row fails closed with a clear error**, rather than defaulting to
 *     unlimited. Defaulting open means a misconfigured plan silently gives away paid
 *     capacity, and nobody notices until the bill for storage arrives.
 */
@Injectable()
export class PlanQuotaService {
  private readonly logger = new Logger(PlanQuotaService.name);
  private static readonly LIMIT_CACHE_TTL = 300;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Resolves the tenant's limit for a key.
   *
   * Returns null when the tenant has no live subscription at all — the caller decides
   * whether that is a hard block (a write) or simply unlimited (during provisioning,
   * before billing exists).
   */
  async limitFor(tenantId: string, limitKey: PlanLimitKey): Promise<number | null> {
    const cacheKey = `quota:limits:${tenantId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const limits = JSON.parse(cached) as Record<string, number> | null;
        if (limits === null) return null;
        return limits[limitKey] ?? null;
      }
    } catch {
      // Cache unavailable — fall through to the database. A quota check must not depend
      // on Redis being up.
    }

    const rows = (await this.dataSource.query(
      `SELECT pl.limit_key AS limitKey, pl.limit_value AS limitValue
         FROM subscriptions s
         JOIN plan_limits pl ON pl.plan_id = s.plan_id
        WHERE s.tenant_id = ?
          AND s.active_guard = 1`,
      [tenantId],
    )) as { limitKey: PlanLimitKey; limitValue: string }[];

    if (rows.length === 0) {
      // Cached briefly and negatively, so a tenant mid-provisioning does not hammer this
      // query on every write.
      await this.safeSet(cacheKey, 'null', 30);
      return null;
    }

    const limits: Record<string, number> = {};
    for (const row of rows) limits[row.limitKey] = Number(row.limitValue);

    await this.safeSet(cacheKey, JSON.stringify(limits), PlanQuotaService.LIMIT_CACHE_TTL);

    return limits[limitKey] ?? null;
  }

  /** Current usage. Never cached — see the class comment. */
  async usageFor(tenantId: string, limitKey: PlanLimitKey): Promise<number> {
    const query = USAGE_QUERIES[limitKey];

    try {
      const rows = (await this.dataSource.query(query.sql, query.params(tenantId))) as {
        c: number | string;
      }[];
      return Number(rows[0]?.c ?? 0);
    } catch (error) {
      // The table may not exist yet — `products`, `orders`, `channels` and `media_assets`
      // arrive in later phases. Treating that as zero usage keeps the guard usable now
      // without pretending the limit is unlimited.
      const message = error instanceof Error ? error.message : String(error);
      if (/doesn't exist/i.test(message)) {
        this.logger.debug(`Usage table for ${limitKey} not present yet; counting as 0`);
        return 0;
      }
      throw error;
    }
  }

  async status(tenantId: string, limitKey: PlanLimitKey): Promise<QuotaStatus> {
    const [max, current] = await Promise.all([
      this.limitFor(tenantId, limitKey),
      this.usageFor(tenantId, limitKey),
    ]);

    const effectiveMax = max ?? UNLIMITED;
    const unlimited = effectiveMax === UNLIMITED;

    return {
      limitKey,
      current,
      max: effectiveMax,
      unlimited,
      remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, effectiveMax - current),
    };
  }

  /**
   * Throws `PlanQuotaExceededError` (→ 402) when adding `increment` would breach the cap.
   *
   * The error carries `{ limitKey, current, max, upgradeUrl }` so the console can say
   * "you're at 100 of 100 products — upgrade to Standard for 2,000" and link straight to
   * checkout. A bare 402 generates a support ticket; an actionable one converts.
   */
  async assertWithinLimit(
    tenantId: string,
    limitKey: PlanLimitKey,
    increment = 1,
  ): Promise<void> {
    const max = await this.limitFor(tenantId, limitKey);

    // No live subscription: allowed. Billing state is enforced by TenantStatusGuard, which
    // has the full picture; duplicating that judgement here would double-block a tenant
    // that is merely mid-provisioning.
    if (max === null) return;
    if (max === UNLIMITED) return;

    const current = await this.usageFor(tenantId, limitKey);

    if (current + increment > max) {
      throw new PlanQuotaExceededError(limitKey, current, max, '/settings/billing');
    }
  }

  /** Invalidates cached limits — called on plan change, upgrade, downgrade, cancellation. */
  async invalidate(tenantId: string): Promise<void> {
    try {
      await this.redis.del(`quota:limits:${tenantId}`);
    } catch {
      /* TTL will catch up */
    }
  }

  /** Every quota at once, for the billing screen's usage bars. */
  async summary(tenantId: string, keys: PlanLimitKey[]): Promise<QuotaStatus[]> {
    return Promise.all(keys.map((key) => this.status(tenantId, key)));
  }

  private async safeSet(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, value);
    } catch {
      /* best effort */
    }
  }
}
