import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { DailySalesRollupRepository } from './daily-sales-rollup.repository';

/** Order statuses that represent a genuine, counted sale — a `DRAFT`/`FAILED` order never happened commercially. */
const COUNTED_STATUSES = "('CONFIRMED','PROCESSING','SHIPPED','DELIVERED','COMPLETED','RETURNED')";

interface OrderAggRow {
  channel: string;
  ordersCount: string;
  grossMinor: string | null;
  discountMinor: string | null;
  taxMinor: string | null;
  shippingMinor: string | null;
  totalMinor: string | null;
}

interface ItemAggRow {
  channel: string;
  itemsCount: string | null;
  cogsMinor: string | null;
}

interface RefundAggRow {
  channel: string;
  refundMinor: string | null;
}

interface CustomerAggRow {
  channel: string;
  newCustomers: string;
  returningCustomers: string;
}

interface CancelledAggRow {
  channel: string;
  cancelledCount: string;
}

interface Bucket {
  ordersCount: number;
  itemsCount: number;
  grossMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  shippingMinor: bigint;
  refundMinor: bigint;
  netMinor: bigint;
  cogsMinor: bigint;
  newCustomers: number;
  returningCustomers: number;
  cancelledCount: number;
}

function emptyBucket(): Bucket {
  return {
    ordersCount: 0,
    itemsCount: 0,
    grossMinor: 0n,
    discountMinor: 0n,
    taxMinor: 0n,
    shippingMinor: 0n,
    refundMinor: 0n,
    netMinor: 0n,
    cogsMinor: 0n,
    newCustomers: 0,
    returningCustomers: 0,
    cancelledCount: 0,
  };
}

/**
 * Computes and upserts one tenant/store/date's `daily_sales_rollup` rows —
 * one per channel that had activity, plus an `ALL` row summing them.
 *
 * Every report and dashboard number in this phase reads from the rollup,
 * never from `orders` directly (the roadmap's own architectural requirement)
 * — this is the one place that scans raw commerce tables.
 *
 * Idempotent by construction: it recomputes the whole day from scratch and
 * upserts, so calling it twice for the same day (the nightly batch, then a
 * same-day `order.placed` incremental refresh) converges rather than
 * double-counts.
 */
@Injectable()
export class SalesRollupService {
  private readonly logger = new Logger(SalesRollupService.name);

  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly rollups: DailySalesRollupRepository,
  ) {}

  async computeForStoreDate(tenantId: string, storeId: string, date: string): Promise<void> {
    const buckets = new Map<string, Bucket>();
    const touch = (channel: string): Bucket => {
      let bucket = buckets.get(channel);
      if (!bucket) {
        bucket = emptyBucket();
        buckets.set(channel, bucket);
      }
      return bucket;
    };

    const orderRows = (await this.manager.query(
      `SELECT channel,
              COUNT(*) AS ordersCount,
              SUM(subtotal_minor) AS grossMinor,
              SUM(discount_minor) AS discountMinor,
              SUM(tax_minor) AS taxMinor,
              SUM(shipping_minor) AS shippingMinor,
              SUM(total_minor) AS totalMinor
         FROM orders
        WHERE tenant_id = ? AND store_id = ? AND DATE(confirmed_at) = ? AND status IN ${COUNTED_STATUSES}
        GROUP BY channel`,
      [tenantId, storeId, date],
    )) as OrderAggRow[];

    for (const row of orderRows) {
      const bucket = touch(row.channel);
      bucket.ordersCount = Number(row.ordersCount);
      bucket.grossMinor = BigInt(row.grossMinor ?? '0');
      bucket.discountMinor = BigInt(row.discountMinor ?? '0');
      bucket.taxMinor = BigInt(row.taxMinor ?? '0');
      bucket.shippingMinor = BigInt(row.shippingMinor ?? '0');
      bucket.netMinor = BigInt(row.totalMinor ?? '0');
    }

    const itemRows = (await this.manager.query(
      `SELECT o.channel,
              SUM(oi.quantity) AS itemsCount,
              SUM(oi.quantity * COALESCE(oi.unit_cost_minor, 0)) AS cogsMinor
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.tenant_id = ? AND o.store_id = ? AND DATE(o.confirmed_at) = ? AND o.status IN ${COUNTED_STATUSES}
        GROUP BY o.channel`,
      [tenantId, storeId, date],
    )) as ItemAggRow[];

    for (const row of itemRows) {
      const bucket = touch(row.channel);
      bucket.itemsCount = Number(row.itemsCount ?? 0);
      bucket.cogsMinor = BigInt(row.cogsMinor ?? '0');
    }

    const refundRows = (await this.manager.query(
      `SELECT o.channel, SUM(r.refund_amount_minor) AS refundMinor
         FROM returns r
         JOIN orders o ON o.id = r.order_id
        WHERE r.tenant_id = ? AND o.store_id = ? AND DATE(r.completed_at) = ? AND r.status = 'COMPLETED'
        GROUP BY o.channel`,
      [tenantId, storeId, date],
    )) as RefundAggRow[];

    for (const row of refundRows) {
      const bucket = touch(row.channel);
      bucket.refundMinor = BigInt(row.refundMinor ?? '0');
      bucket.netMinor -= bucket.refundMinor;
    }

    const cancelledRows = (await this.manager.query(
      `SELECT channel, COUNT(*) AS cancelledCount
         FROM orders
        WHERE tenant_id = ? AND store_id = ? AND DATE(cancelled_at) = ?
        GROUP BY channel`,
      [tenantId, storeId, date],
    )) as CancelledAggRow[];

    for (const row of cancelledRows) {
      touch(row.channel).cancelledCount = Number(row.cancelledCount);
    }

    // New vs. returning: a customer's very first-ever order landing on `date`
    // makes every order they place that day count as "new"; any customer
    // whose first order predates `date` counts as "returning".
    const customerRows = (await this.manager.query(
      `SELECT o.channel,
              COUNT(DISTINCT CASE WHEN c.first_order_at IS NOT NULL AND DATE(c.first_order_at) = ? THEN o.customer_id END) AS newCustomers,
              COUNT(DISTINCT CASE WHEN c.first_order_at IS NOT NULL AND DATE(c.first_order_at) < ? THEN o.customer_id END) AS returningCustomers
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
        WHERE o.tenant_id = ? AND o.store_id = ? AND DATE(o.confirmed_at) = ? AND o.status IN ${COUNTED_STATUSES}
        GROUP BY o.channel`,
      [date, date, tenantId, storeId, date],
    )) as CustomerAggRow[];

    for (const row of customerRows) {
      const bucket = touch(row.channel);
      bucket.newCustomers = Number(row.newCustomers);
      bucket.returningCustomers = Number(row.returningCustomers);
    }

    const all = emptyBucket();
    for (const bucket of buckets.values()) {
      all.ordersCount += bucket.ordersCount;
      all.itemsCount += bucket.itemsCount;
      all.grossMinor += bucket.grossMinor;
      all.discountMinor += bucket.discountMinor;
      all.taxMinor += bucket.taxMinor;
      all.shippingMinor += bucket.shippingMinor;
      all.refundMinor += bucket.refundMinor;
      all.netMinor += bucket.netMinor;
      all.cogsMinor += bucket.cogsMinor;
      all.newCustomers += bucket.newCustomers;
      all.returningCustomers += bucket.returningCustomers;
      all.cancelledCount += bucket.cancelledCount;
    }
    buckets.set('ALL', all);

    for (const [channel, bucket] of buckets) {
      await this.rollups.upsert({
        tenantId,
        storeId,
        date,
        channel,
        ordersCount: bucket.ordersCount,
        itemsCount: bucket.itemsCount,
        grossMinor: bucket.grossMinor.toString(),
        discountMinor: bucket.discountMinor.toString(),
        taxMinor: bucket.taxMinor.toString(),
        shippingMinor: bucket.shippingMinor.toString(),
        refundMinor: bucket.refundMinor.toString(),
        netMinor: bucket.netMinor.toString(),
        cogsMinor: bucket.cogsMinor.toString(),
        newCustomers: bucket.newCustomers,
        returningCustomers: bucket.returningCustomers,
        cancelledCount: bucket.cancelledCount,
      });
    }

    this.logger.debug(`Rolled up store ${storeId} for ${date}: ${buckets.size - 1} channel(s)`);
  }

  /** Every (tenant, store) pair worth rolling up — active tenants with an active store. */
  async listActiveStores(): Promise<{ tenantId: string; storeId: string }[]> {
    return this.manager.query(
      `SELECT s.tenant_id AS tenantId, s.id AS storeId
         FROM stores s
         JOIN tenants t ON t.id = s.tenant_id
        WHERE s.status = 'ACTIVE' AND t.status = 'ACTIVE'`,
    ) as Promise<{ tenantId: string; storeId: string }[]>;
  }
}
