import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { DailySalesRollupEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

/**
 * `store_id` filter for `daily_sales_rollup` queries. Callers pass the store's
 * public id while the column holds the internal id, so it is resolved inline
 * within the same tenant. An id that doesn't resolve compares against NULL and
 * matches no rows.
 */
export function rollupStoreFilter(tenantId: string, storePublicId: string | null): { clause: string; params: string[] } {
  if (!storePublicId) return { clause: '', params: [] };
  return {
    clause: 'AND store_id = (SELECT s.id FROM stores s WHERE s.public_id = ? AND s.tenant_id = ?)',
    params: [storePublicId, tenantId],
  };
}

@Injectable()
export class DailySalesRollupRepository extends TenantScopedRepository<DailySalesRollupEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, DailySalesRollupEntity, context, 'tenantId');
  }

  /** Composite PK, no surrogate id — an `INSERT … ON DUPLICATE KEY UPDATE` upsert rather than find-then-save. */
  async upsert(row: {
    tenantId: string;
    storeId: string;
    date: string;
    channel: string;
    ordersCount: number;
    itemsCount: number;
    grossMinor: string;
    discountMinor: string;
    taxMinor: string;
    shippingMinor: string;
    refundMinor: string;
    netMinor: string;
    cogsMinor: string;
    newCustomers: number;
    returningCustomers: number;
    cancelledCount: number;
  }): Promise<void> {
    await this.manager.query(
      `INSERT INTO daily_sales_rollup
         (tenant_id, store_id, \`date\`, channel, orders_count, items_count, gross_minor, discount_minor,
          tax_minor, shipping_minor, refund_minor, net_minor, cogs_minor, new_customers, returning_customers, cancelled_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         orders_count = VALUES(orders_count), items_count = VALUES(items_count),
         gross_minor = VALUES(gross_minor), discount_minor = VALUES(discount_minor),
         tax_minor = VALUES(tax_minor), shipping_minor = VALUES(shipping_minor),
         refund_minor = VALUES(refund_minor), net_minor = VALUES(net_minor), cogs_minor = VALUES(cogs_minor),
         new_customers = VALUES(new_customers), returning_customers = VALUES(returning_customers),
         cancelled_count = VALUES(cancelled_count)`,
      [
        row.tenantId,
        row.storeId,
        row.date,
        row.channel,
        row.ordersCount,
        row.itemsCount,
        row.grossMinor,
        row.discountMinor,
        row.taxMinor,
        row.shippingMinor,
        row.refundMinor,
        row.netMinor,
        row.cogsMinor,
        row.newCustomers,
        row.returningCustomers,
        row.cancelledCount,
      ],
    );
  }

  /** Sums every channel row for a date range — the read side every report in this phase composes from. */
  async sumRange(storeId: string | null, from: string, to: string): Promise<{
    ordersCount: number;
    itemsCount: number;
    grossMinor: string;
    discountMinor: string;
    taxMinor: string;
    shippingMinor: string;
    refundMinor: string;
    netMinor: string;
    newCustomers: number;
    returningCustomers: number;
  }> {
    const tenantId = this.tenantId;
    const store = rollupStoreFilter(tenantId, storeId);
    const storeClause = store.clause;
    const params = [tenantId, from, to, ...store.params];

    const [row] = (await this.manager.query(
      `SELECT
         COALESCE(SUM(orders_count),0) AS ordersCount, COALESCE(SUM(items_count),0) AS itemsCount,
         COALESCE(SUM(gross_minor),0) AS grossMinor, COALESCE(SUM(discount_minor),0) AS discountMinor,
         COALESCE(SUM(tax_minor),0) AS taxMinor, COALESCE(SUM(shipping_minor),0) AS shippingMinor,
         COALESCE(SUM(refund_minor),0) AS refundMinor, COALESCE(SUM(net_minor),0) AS netMinor,
         COALESCE(SUM(new_customers),0) AS newCustomers, COALESCE(SUM(returning_customers),0) AS returningCustomers
       FROM daily_sales_rollup
       WHERE tenant_id = ? AND channel = 'ALL' AND \`date\` BETWEEN ? AND ? ${storeClause}`,
      params,
    )) as [{
      ordersCount: string;
      itemsCount: string;
      grossMinor: string;
      discountMinor: string;
      taxMinor: string;
      shippingMinor: string;
      refundMinor: string;
      netMinor: string;
      newCustomers: string;
      returningCustomers: string;
    }];

    return {
      ordersCount: Number(row.ordersCount),
      itemsCount: Number(row.itemsCount),
      grossMinor: row.grossMinor,
      discountMinor: row.discountMinor,
      taxMinor: row.taxMinor,
      shippingMinor: row.shippingMinor,
      refundMinor: row.refundMinor,
      netMinor: row.netMinor,
      newCustomers: Number(row.newCustomers),
      returningCustomers: Number(row.returningCustomers),
    };
  }

  /** Per-day breakdown for the same range — powers the sales-summary chart. */
  async listByDay(storeId: string | null, from: string, to: string): Promise<{ date: string; ordersCount: number; grossMinor: string; netMinor: string }[]> {
    const tenantId = this.tenantId;
    const store = rollupStoreFilter(tenantId, storeId);
    const storeClause = store.clause;
    const params = [tenantId, from, to, ...store.params];

    return this.manager.query(
      `SELECT \`date\`, SUM(orders_count) AS ordersCount, SUM(gross_minor) AS grossMinor, SUM(net_minor) AS netMinor
         FROM daily_sales_rollup
        WHERE tenant_id = ? AND channel = 'ALL' AND \`date\` BETWEEN ? AND ? ${storeClause}
        GROUP BY \`date\`
        ORDER BY \`date\` ASC`,
      params,
    ) as Promise<{ date: string; ordersCount: number; grossMinor: string; netMinor: string }[]>;
  }
}
