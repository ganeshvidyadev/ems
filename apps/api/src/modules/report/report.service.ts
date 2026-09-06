import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import type { ReportType, SalesSummaryQuery, SalesSummaryResponse } from '@ems/contracts';
import { DailySalesRollupRepository } from './daily-sales-rollup.repository';

export interface ReportTable {
  header: string[];
  rows: (string | number)[][];
}

@Injectable()
export class ReportService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly rollups: DailySalesRollupRepository,
  ) {}

  async getSalesSummary(query: SalesSummaryQuery): Promise<SalesSummaryResponse> {
    const storeId = query.storeId ?? null;
    const [totals, byDay] = await Promise.all([
      this.rollups.sumRange(storeId, query.from, query.to),
      this.rollups.listByDay(storeId, query.from, query.to),
    ]);

    return {
      from: query.from,
      to: query.to,
      ordersCount: totals.ordersCount,
      itemsCount: totals.itemsCount,
      grossMinor: totals.grossMinor,
      discountMinor: totals.discountMinor,
      taxMinor: totals.taxMinor,
      shippingMinor: totals.shippingMinor,
      refundMinor: totals.refundMinor,
      netMinor: totals.netMinor,
      newCustomers: totals.newCustomers,
      returningCustomers: totals.returningCustomers,
      currency: 'INR',
      byDay: byDay.map((d) => ({
        date: typeof d.date === 'string' ? d.date : new Date(d.date).toISOString().slice(0, 10),
        ordersCount: Number(d.ordersCount),
        grossMinor: String(d.grossMinor),
        netMinor: String(d.netMinor),
      })),
    };
  }

  /**
   * Builds the exportable table for one report type. `SALES`/`REVENUE`/`ORDERS`
   * all read the rollup (the roadmap's "never scan orders directly" rule);
   * the rest read their own owning table for the range, since the rollup
   * doesn't carry customer/inventory/tax/payment/shipping/commission detail.
   */
  async buildTable(
    type: ReportType,
    tenantId: string,
    from: string,
    to: string,
    storeId: string | null,
  ): Promise<ReportTable> {
    switch (type) {
      case 'SALES':
      case 'REVENUE':
      case 'ORDERS':
        return this.buildRollupTable(tenantId, from, to, storeId);
      case 'CUSTOMERS':
        return this.buildCustomersTable(tenantId, from, to);
      case 'INVENTORY':
        return this.buildInventoryTable(tenantId);
      case 'TAX':
        return this.buildTaxTable(tenantId, from, to);
      case 'PAYMENTS':
        return this.buildPaymentsTable(tenantId, from, to);
      case 'SHIPPING':
        return this.buildShippingTable(tenantId, from, to);
      case 'COMMISSION':
        return this.buildCommissionTable(tenantId, from, to);
    }
  }

  private async buildRollupTable(tenantId: string, from: string, to: string, storeId: string | null): Promise<ReportTable> {
    const clause = storeId ? 'AND store_id = ?' : '';
    const params = storeId ? [tenantId, from, to, storeId] : [tenantId, from, to];
    const rows = (await this.manager.query(
      `SELECT \`date\`, store_id, channel, orders_count, items_count, gross_minor, discount_minor,
              tax_minor, shipping_minor, refund_minor, net_minor, new_customers, returning_customers, cancelled_count
         FROM daily_sales_rollup
        WHERE tenant_id = ? AND \`date\` BETWEEN ? AND ? ${clause}
        ORDER BY \`date\` ASC, channel ASC`,
      params,
    )) as Record<string, unknown>[];

    return {
      header: ['date', 'storeId', 'channel', 'orders', 'items', 'gross', 'discount', 'tax', 'shipping', 'refund', 'net', 'newCustomers', 'returningCustomers', 'cancelled'],
      rows: rows.map((r) => [
        String(r['date']),
        String(r['store_id']),
        String(r['channel']),
        Number(r['orders_count']),
        Number(r['items_count']),
        String(r['gross_minor']),
        String(r['discount_minor']),
        String(r['tax_minor']),
        String(r['shipping_minor']),
        String(r['refund_minor']),
        String(r['net_minor']),
        Number(r['new_customers']),
        Number(r['returning_customers']),
        Number(r['cancelled_count']),
      ]),
    };
  }

  private async buildCustomersTable(tenantId: string, from: string, to: string): Promise<ReportTable> {
    const rows = (await this.manager.query(
      `SELECT c.public_id AS publicId, c.email, COUNT(o.id) AS ordersCount, SUM(o.total_minor) AS spendMinor
         FROM customers c
         JOIN orders o ON o.customer_id = c.id
        WHERE o.tenant_id = ? AND DATE(o.confirmed_at) BETWEEN ? AND ?
          AND o.status IN ('CONFIRMED','PROCESSING','SHIPPED','DELIVERED','COMPLETED','RETURNED')
        GROUP BY c.id
        ORDER BY spendMinor DESC`,
      [tenantId, from, to],
    )) as Record<string, unknown>[];

    return {
      header: ['customerId', 'email', 'orders', 'totalSpentMinor'],
      rows: rows.map((r) => [String(r['publicId']), String(r['email'] ?? ''), Number(r['ordersCount']), String(r['spendMinor'])]),
    };
  }

  private async buildInventoryTable(tenantId: string): Promise<ReportTable> {
    const rows = (await this.manager.query(
      `SELECT p.sku, p.name, il.warehouse_id AS warehouseId, il.quantity_on_hand AS onHand,
              il.quantity_reserved AS reserved, il.quantity_available AS available
         FROM inventory_levels il
         JOIN products p ON p.id = il.product_id
        WHERE il.tenant_id = ?
        ORDER BY p.sku ASC`,
      [tenantId],
    )) as Record<string, unknown>[];

    return {
      header: ['sku', 'name', 'warehouseId', 'onHand', 'reserved', 'available'],
      rows: rows.map((r) => [
        String(r['sku']),
        String(r['name']),
        String(r['warehouseId']),
        Number(r['onHand']),
        Number(r['reserved']),
        Number(r['available']),
      ]),
    };
  }

  private async buildTaxTable(tenantId: string, from: string, to: string): Promise<ReportTable> {
    const rows = (await this.manager.query(
      `SELECT DATE(o.confirmed_at) AS date, oi.tax_rate AS taxRate, SUM(oi.line_tax_minor) AS taxMinor,
              SUM(oi.line_subtotal_minor) AS taxableMinor
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.tenant_id = ? AND DATE(o.confirmed_at) BETWEEN ? AND ?
          AND o.status IN ('CONFIRMED','PROCESSING','SHIPPED','DELIVERED','COMPLETED','RETURNED')
        GROUP BY DATE(o.confirmed_at), oi.tax_rate
        ORDER BY date ASC, taxRate ASC`,
      [tenantId, from, to],
    )) as Record<string, unknown>[];

    return {
      header: ['date', 'taxRate', 'taxableMinor', 'taxMinor'],
      rows: rows.map((r) => [String(r['date']), String(r['taxRate']), String(r['taxableMinor']), String(r['taxMinor'])]),
    };
  }

  private async buildPaymentsTable(tenantId: string, from: string, to: string): Promise<ReportTable> {
    const rows = (await this.manager.query(
      `SELECT DATE(created_at) AS date, gateway, status, COUNT(*) AS count,
              SUM(amount_captured_minor) AS capturedMinor, SUM(amount_refunded_minor) AS refundedMinor
         FROM payments
        WHERE tenant_id = ? AND DATE(created_at) BETWEEN ? AND ?
        GROUP BY DATE(created_at), gateway, status
        ORDER BY date ASC`,
      [tenantId, from, to],
    )) as Record<string, unknown>[];

    return {
      header: ['date', 'gateway', 'status', 'count', 'capturedMinor', 'refundedMinor'],
      rows: rows.map((r) => [
        String(r['date']),
        String(r['gateway']),
        String(r['status']),
        Number(r['count']),
        String(r['capturedMinor']),
        String(r['refundedMinor']),
      ]),
    };
  }

  private async buildShippingTable(tenantId: string, from: string, to: string): Promise<ReportTable> {
    const rows = (await this.manager.query(
      `SELECT carrier, status, COUNT(*) AS count
         FROM shipments
        WHERE tenant_id = ? AND DATE(created_at) BETWEEN ? AND ?
        GROUP BY carrier, status
        ORDER BY carrier ASC`,
      [tenantId, from, to],
    )) as Record<string, unknown>[];

    return {
      header: ['carrier', 'status', 'count'],
      rows: rows.map((r) => [String(r['carrier']), String(r['status']), Number(r['count'])]),
    };
  }

  private async buildCommissionTable(tenantId: string, from: string, to: string): Promise<ReportTable> {
    const rows = (await this.manager.query(
      `SELECT DATE(created_at) AS date, entry_type AS entryType, beneficiary_type AS beneficiaryType,
              SUM(commission_minor) AS commissionMinor, SUM(platform_fee_minor) AS platformFeeMinor,
              SUM(net_minor) AS netMinor
         FROM commission_ledger
        WHERE (supplier_tenant_id = ? OR beneficiary_tenant_id = ?) AND DATE(created_at) BETWEEN ? AND ?
        GROUP BY DATE(created_at), entry_type, beneficiary_type
        ORDER BY date ASC`,
      [tenantId, tenantId, from, to],
    )) as Record<string, unknown>[];

    return {
      header: ['date', 'entryType', 'beneficiaryType', 'commissionMinor', 'platformFeeMinor', 'netMinor'],
      rows: rows.map((r) => [
        String(r['date']),
        String(r['entryType']),
        String(r['beneficiaryType']),
        String(r['commissionMinor']),
        String(r['platformFeeMinor']),
        String(r['netMinor']),
      ]),
    };
  }
}
