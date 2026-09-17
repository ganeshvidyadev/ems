import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { PlatformAnalyticsResponse } from '@ems/contracts';

@Injectable()
export class PlatformAnalyticsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async summary(): Promise<PlatformAnalyticsResponse> {
    const [
      tenantsByStatus,
      [{ total: newTenantsLast30Days }],
      [{ total: activeSubscriptions }],
      mrrRows,
      planDistribution,
      [{ total: openSupportTickets }],
      [{ total: pendingSettlements }],
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT status, COUNT(*) AS count FROM tenants WHERE deleted_at IS NULL GROUP BY status`,
      ) as Promise<{ status: string; count: number }[]>,
      this.dataSource.query(
        `SELECT COUNT(*) AS total FROM tenants WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 30 DAY`,
      ) as Promise<{ total: number }[]>,
      this.dataSource.query(
        `SELECT COUNT(*) AS total FROM subscriptions WHERE status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')`,
      ) as Promise<{ total: number }[]>,
      // Yearly subscriptions normalized to a monthly figure — MRR is a monthly metric
      // by definition, and a raw sum would overstate a yearly plan twelvefold.
      this.dataSource.query(
        `SELECT currency,
                SUM(CASE WHEN billing_cycle = 'YEARLY' THEN unit_amount_minor / 12 ELSE unit_amount_minor END) AS mrrMinor
           FROM subscriptions
          WHERE status IN ('ACTIVE', 'PAST_DUE')
          GROUP BY currency`,
      ) as Promise<{ currency: string; mrrMinor: string }[]>,
      this.dataSource.query(
        `SELECT p.code AS planCode, p.name AS planName, COUNT(s.id) AS subscriberCount
           FROM plans p
           LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
          GROUP BY p.id, p.code, p.name
          ORDER BY p.sort_order ASC`,
      ) as Promise<{ planCode: string; planName: string; subscriberCount: number }[]>,
      this.dataSource.query(
        `SELECT COUNT(*) AS total FROM support_tickets WHERE status IN ('OPEN', 'IN_PROGRESS', 'ESCALATED')`,
      ) as Promise<{ total: number }[]>,
      this.dataSource.query(
        `SELECT COUNT(*) AS total FROM settlements WHERE status = 'PENDING_APPROVAL'`,
      ) as Promise<{ total: number }[]>,
    ]);

    return {
      totalTenants: tenantsByStatus.reduce((sum, r) => sum + Number(r.count), 0),
      tenantsByStatus: tenantsByStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
      newTenantsLast30Days: Number(newTenantsLast30Days),
      activeSubscriptions: Number(activeSubscriptions),
      mrr: mrrRows.map((r) => ({ currency: r.currency, mrrMinor: String(Math.trunc(Number(r.mrrMinor))) })),
      planDistribution: planDistribution.map((r) => ({
        planCode: r.planCode,
        planName: r.planName,
        subscriberCount: Number(r.subscriberCount),
      })),
      openSupportTickets: Number(openSupportTickets),
      pendingSettlements: Number(pendingSettlements),
    };
  }
}
