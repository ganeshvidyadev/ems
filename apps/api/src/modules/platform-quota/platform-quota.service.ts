import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { PlatformQuotaOverviewResponse } from '@ems/contracts';
import { PLAN_LIMIT_KEYS, UNLIMITED, type PlanLimitKey } from '../../database/entities';

/**
 * Bulk usage query per quota dimension, one row per tenant — the platform-wide twin of
 * `PlanQuotaService.usageFor()`, which is deliberately per-tenant (it runs on every write
 * a merchant makes) and would be an N+1 query fired once per tenant if reused here for a
 * dozen-plus tenants. A `GROUP BY tenant_id` gets every tenant's usage for one dimension
 * in a single query instead.
 */
const USAGE_QUERIES: Record<PlanLimitKey, string> = {
  max_products: `SELECT tenant_id AS tenantId, COUNT(*) AS cnt FROM products WHERE deleted_at IS NULL GROUP BY tenant_id`,
  max_orders_per_month: `SELECT tenant_id AS tenantId, COUNT(*) AS cnt FROM orders
                           WHERE created_at >= DATE_FORMAT(NOW(3), '%Y-%m-01') GROUP BY tenant_id`,
  max_staff_users: `SELECT tenant_id AS tenantId, COUNT(*) AS cnt FROM users
                      WHERE deleted_at IS NULL AND status <> 'DEACTIVATED' GROUP BY tenant_id`,
  max_storage_mb: `SELECT tenant_id AS tenantId, COALESCE(SUM(size_bytes), 0) DIV 1048576 AS cnt
                     FROM media_assets GROUP BY tenant_id`,
  max_stores: `SELECT tenant_id AS tenantId, COUNT(*) AS cnt FROM stores WHERE deleted_at IS NULL GROUP BY tenant_id`,
  max_warehouses: `SELECT tenant_id AS tenantId, COUNT(*) AS cnt FROM warehouses WHERE deleted_at IS NULL GROUP BY tenant_id`,
  max_channels: `SELECT tenant_id AS tenantId, COUNT(*) AS cnt FROM channels WHERE status <> 'DISCONNECTED' GROUP BY tenant_id`,
  max_custom_domains: `SELECT tenant_id AS tenantId, COUNT(*) AS cnt FROM tenant_domains WHERE type = 'CUSTOM' GROUP BY tenant_id`,
};

interface UsageRow {
  tenantId: string;
  cnt: number | string;
}

@Injectable()
export class PlatformQuotaService {
  private readonly logger = new Logger(PlatformQuotaService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Every tenant with a live subscription, every quota dimension, current usage against
   * the plan's own limit. A tenant with no live subscription has no quota context (same
   * "null means unlimited/inapplicable, not zero" reasoning `PlanQuotaService.limitFor()`
   * already uses) and is left out entirely rather than shown with a fabricated 0/0.
   */
  async overview(): Promise<PlatformQuotaOverviewResponse> {
    const [tenants, limitRows, ...usageResults] = await Promise.all([
      this.dataSource.query(
        `SELECT t.id AS tenantId, t.public_id AS publicId, t.business_name AS businessName, p.code AS planCode
           FROM tenants t
           JOIN subscriptions s ON s.tenant_id = t.id AND s.active_guard = 1
           JOIN plans p ON p.id = s.plan_id
          WHERE t.deleted_at IS NULL`,
      ) as Promise<{ tenantId: string; publicId: string; businessName: string; planCode: string }[]>,
      this.dataSource.query(
        `SELECT s.tenant_id AS tenantId, pl.limit_key AS limitKey, pl.limit_value AS limitValue
           FROM subscriptions s
           JOIN plan_limits pl ON pl.plan_id = s.plan_id
          WHERE s.active_guard = 1`,
      ) as Promise<{ tenantId: string; limitKey: PlanLimitKey; limitValue: string }[]>,
      ...PLAN_LIMIT_KEYS.map((key) => this.usageForKey(key)),
    ]);

    const limitsByTenant = new Map<string, Map<PlanLimitKey, number>>();
    for (const row of limitRows) {
      const byKey = limitsByTenant.get(row.tenantId) ?? new Map();
      byKey.set(row.limitKey, Number(row.limitValue));
      limitsByTenant.set(row.tenantId, byKey);
    }

    const usageByKeyThenTenant = new Map<PlanLimitKey, Map<string, number>>();
    PLAN_LIMIT_KEYS.forEach((key, index) => {
      const byTenant = new Map<string, number>();
      for (const row of usageResults[index]) byTenant.set(row.tenantId, Number(row.cnt));
      usageByKeyThenTenant.set(key, byTenant);
    });

    return {
      tenants: tenants.map((tenant) => ({
        tenantId: tenant.publicId,
        tenantName: tenant.businessName,
        planCode: tenant.planCode,
        quotas: PLAN_LIMIT_KEYS.map((limitKey) => {
          const max = limitsByTenant.get(tenant.tenantId)?.get(limitKey) ?? UNLIMITED;
          const current = usageByKeyThenTenant.get(limitKey)?.get(tenant.tenantId) ?? 0;
          const unlimited = max === UNLIMITED;
          return {
            limitKey,
            current,
            max,
            percentage: unlimited ? null : max === 0 ? (current > 0 ? 100 : 0) : Math.round((current / max) * 100),
          };
        }),
      })),
    };
  }

  /**
   * Same "table may not exist yet" tolerance as `PlanQuotaService.usageFor()` — with
   * eight queries running in parallel, one missing table (`products`/`orders`/
   * `channels`/`media_assets` all arrive in later phases per that service's own
   * comment) must not take down every other dimension's real numbers with it.
   */
  private async usageForKey(key: PlanLimitKey): Promise<UsageRow[]> {
    try {
      return (await this.dataSource.query(USAGE_QUERIES[key])) as UsageRow[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/doesn't exist/i.test(message)) {
        this.logger.debug(`Usage table for ${key} not present yet; counting as 0 for every tenant`);
        return [];
      }
      throw error;
    }
  }
}
