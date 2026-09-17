import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessRuleError, NotFoundError } from '@ems/kernel';
import type { PlatformAlertListQuery, PlatformAlertResponse } from '@ems/contracts';
import { PlatformAlertEntity, TenantEntity } from '../../database/entities';
import { PlatformHealthService } from '../platform-health/platform-health.service';
import { PlatformQuotaService } from '../platform-quota/platform-quota.service';
import { SupportTicketRepository } from '../support/support-ticket.repository';
import { QueueRegistry } from '../../queues/queue.registry';
import type { AuditActor } from '../platform-tenant/platform-tenant.service';

/** A queue sitting on this many retained failures is a "spike", not routine noise. */
const QUEUE_FAILURE_THRESHOLD = 5;
/** A tenant's plan is genuinely at risk of blocking writes above this. Below it is
 * "worth watching", which the Usage & Quotas page already shows continuously — an
 * alert exists for the smaller set of tenants who need someone to actually act. */
const QUOTA_ALERT_THRESHOLD = 90;
const TRIAL_EXPIRING_WINDOW_DAYS = 7;

interface AlertMatch {
  type: string;
  dedupeKey: string;
  tenantId: string | null;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

export interface PlatformAlertList {
  items: PlatformAlertResponse[];
  total: number;
}

/**
 * Alert Center.
 *
 * Every condition here is built from a signal this session's own audit confirmed is
 * real (Platform Health, the quota dashboard, the SLA-breach query added alongside
 * this, tenant trial dates) — nothing synthetic, and nothing for a condition this
 * codebase cannot actually detect (there is no webhook-failure signal here because
 * there is no outbound webhook delivery system to detect failures from — see this
 * session's own Phase 0 audit).
 *
 * `reconcile()` runs at the top of every `list()` call rather than on a cron: this is
 * a low-QPS admin page, and adding a scheduler for it would be new infrastructure
 * this feature does not otherwise need. It always evaluates every condition, which
 * is what makes the auto-resolve pass below correct — an alert not present in this
 * pass's matches is, by construction, no longer true.
 */
@Injectable()
export class PlatformAlertService {
  private readonly logger = new Logger(PlatformAlertService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly health: PlatformHealthService,
    private readonly quotas: PlatformQuotaService,
    private readonly tickets: SupportTicketRepository,
    private readonly queues: QueueRegistry,
  ) {}

  async list(query: PlatformAlertListQuery): Promise<PlatformAlertList> {
    await this.reconcile();

    const qb = this.dataSource.getRepository(PlatformAlertEntity).createQueryBuilder('a');

    if (query.status) qb.andWhere('a.status = :status', { status: query.status });
    if (query.severity) qb.andWhere('a.severity = :severity', { severity: query.severity });
    if (query.type) qb.andWhere('a.type = :type', { type: query.type });
    if (query.tenantId) {
      // `tenant_id` is internal; translate the public id the same way every other
      // platform-* service's own `tenantId` filter does.
      const tenant = await this.dataSource
        .getRepository(TenantEntity)
        .findOne({ where: { publicId: query.tenantId } });
      qb.andWhere('a.tenant_id = :internalTenantId', { internalTenantId: tenant?.id ?? '0' });
    }

    qb.orderBy('a.last_seen_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [entities, total] = await qb.getManyAndCount();

    // Batch-resolve tenant names for this page only — same "fetch then resolve
    // display data separately" shape `PlatformTenantService.primaryDomains()` uses,
    // rather than a join TypeORM's raw-table + orderBy combination doesn't handle.
    const tenantIds = [...new Set(entities.map((e) => e.tenantId).filter((id): id is string => id !== null))];
    const nameByTenantId = new Map<string, string>();
    if (tenantIds.length > 0) {
      const tenants = await this.dataSource
        .getRepository(TenantEntity)
        .createQueryBuilder('t')
        .where('t.id IN (:...tenantIds)', { tenantIds })
        .getMany();
      for (const tenant of tenants) nameByTenantId.set(tenant.id, tenant.businessName);
    }

    return {
      items: entities.map((entity) => this.toResponse(entity, entity.tenantId ? nameByTenantId.get(entity.tenantId) ?? null : null)),
      total,
    };
  }

  async acknowledge(id: string, actor: AuditActor): Promise<void> {
    await this.transition(id, 'ACKNOWLEDGED', actor);
  }

  async investigate(id: string, actor: AuditActor): Promise<void> {
    await this.transition(id, 'INVESTIGATING', actor);
  }

  async resolve(id: string, actor: AuditActor): Promise<void> {
    await this.transition(id, 'RESOLVED', actor);
  }

  private async transition(
    id: string,
    status: 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED',
    actor: AuditActor,
  ): Promise<void> {
    const repo = this.dataSource.getRepository(PlatformAlertEntity);
    const alert = await repo.findOne({ where: { id } });
    if (!alert) throw new NotFoundError('PlatformAlert', id);
    if (alert.status === 'RESOLVED') {
      throw new BusinessRuleError('This alert is already resolved');
    }

    alert.status = status;
    if (status === 'ACKNOWLEDGED') {
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = actor.id;
    }
    if (status === 'RESOLVED') {
      alert.resolvedAt = new Date();
      alert.resolvedBy = actor.id;
    }
    await repo.save(alert);

    await this.audit(actor, `platform_alert.${status.toLowerCase()}`, id, alert.tenantId);
  }

  // -------------------------------------------------------------------------
  // Reconciliation
  // -------------------------------------------------------------------------

  private async reconcile(): Promise<void> {
    const tenants = (await this.dataSource.query(
      `SELECT id, public_id AS publicId, business_name AS businessName FROM tenants WHERE deleted_at IS NULL`,
    )) as { id: string; publicId: string; businessName: string }[];
    const nameByInternalId = new Map(tenants.map((t) => [t.id, t.businessName]));
    const internalIdByPublicId = new Map(tenants.map((t) => [t.publicId, t.id]));

    const matches: AlertMatch[] = [
      ...(await this.infraDownMatches()),
      ...(await this.queueFailureMatches()),
      ...(await this.paymentFailureMatches()),
      ...(await this.quotaThresholdMatches(internalIdByPublicId)),
      ...(await this.slaBreachMatches(nameByInternalId)),
      ...(await this.trialExpiringMatches()),
    ];

    await this.upsertMatches(matches);
    await this.autoResolveStale(matches);
  }

  private async infraDownMatches(): Promise<AlertMatch[]> {
    const health = await this.health.overview();
    return health.infra
      .filter((dep) => dep.status === 'DOWN')
      .map((dep) => ({
        type: 'INFRA_DOWN',
        dedupeKey: `INFRA_DOWN:${dep.name}`,
        tenantId: null,
        severity: 'CRITICAL' as const,
        title: `${dep.name} is down`,
        description: dep.detail ?? null,
        metadata: { name: dep.name },
      }));
  }

  private async queueFailureMatches(): Promise<AlertMatch[]> {
    const depths = await this.queues.depths();
    return Object.entries(depths)
      .filter(([, depth]) => depth.failed >= QUEUE_FAILURE_THRESHOLD)
      .map(([name, depth]) => ({
        type: 'QUEUE_FAILURE_SPIKE',
        dedupeKey: `QUEUE_FAILURE_SPIKE:${name}`,
        tenantId: null,
        severity: 'HIGH' as const,
        title: `${name} queue has ${depth.failed} retained failed jobs`,
        description: null,
        metadata: { queue: name, failed: depth.failed },
      }));
  }

  private async paymentFailureMatches(): Promise<AlertMatch[]> {
    const rows = (await this.dataSource.query(
      `SELECT sp.tenant_id AS tenantId, t.business_name AS tenantName, COUNT(*) AS cnt
         FROM subscription_payments sp
         JOIN tenants t ON t.id = sp.tenant_id
        WHERE sp.status = 'FAILED' AND sp.created_at >= NOW() - INTERVAL 1 DAY
        GROUP BY sp.tenant_id, t.business_name`,
    )) as { tenantId: string; tenantName: string; cnt: string }[];

    return rows.map((row) => ({
      type: 'PAYMENT_FAILURE',
      dedupeKey: `PAYMENT_FAILURE:${row.tenantId}`,
      tenantId: row.tenantId,
      severity: 'HIGH' as const,
      title: `${row.tenantName} has ${row.cnt} failed payment(s) in the last 24h`,
      description: null,
      metadata: { count: Number(row.cnt) },
    }));
  }

  private async quotaThresholdMatches(internalIdByPublicId: Map<string, string>): Promise<AlertMatch[]> {
    const overview = await this.quotas.overview();
    const matches: AlertMatch[] = [];

    for (const tenant of overview.tenants) {
      const internalId = internalIdByPublicId.get(tenant.tenantId) ?? null;
      for (const row of tenant.quotas) {
        if (row.percentage === null || row.percentage < QUOTA_ALERT_THRESHOLD) continue;
        matches.push({
          type: 'QUOTA_THRESHOLD',
          dedupeKey: `QUOTA_THRESHOLD:${tenant.tenantId}:${row.limitKey}`,
          tenantId: internalId,
          severity: row.percentage >= 100 ? 'HIGH' : 'MEDIUM',
          title: `${tenant.tenantName} is at ${row.percentage}% of its ${row.limitKey} limit`,
          description: null,
          metadata: { limitKey: row.limitKey, current: row.current, max: row.max, percentage: row.percentage },
        });
      }
    }
    return matches;
  }

  private async slaBreachMatches(nameByInternalId: Map<string, string>): Promise<AlertMatch[]> {
    const breached = await this.tickets.findBreachedAcrossTenants();
    return breached.map((ticket) => ({
      type: 'SUPPORT_SLA_BREACH',
      dedupeKey: `SUPPORT_SLA_BREACH:${ticket.id}`,
      tenantId: ticket.tenantId,
      severity: 'MEDIUM' as const,
      title: `Ticket ${ticket.ticketNumber} breached its SLA${
        ticket.tenantId ? ` (${nameByInternalId.get(ticket.tenantId) ?? 'unknown tenant'})` : ''
      }`,
      description: ticket.subject,
      metadata: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, slaDueAt: ticket.slaDueAt },
    }));
  }

  private async trialExpiringMatches(): Promise<AlertMatch[]> {
    const rows = (await this.dataSource.query(
      `SELECT id, business_name AS businessName, trial_ends_at AS trialEndsAt
         FROM tenants
        WHERE status = 'TRIAL' AND deleted_at IS NULL AND trial_ends_at IS NOT NULL
          AND trial_ends_at <= NOW() + INTERVAL ${TRIAL_EXPIRING_WINDOW_DAYS} DAY`,
    )) as { id: string; businessName: string; trialEndsAt: Date }[];

    return rows.map((row) => ({
      type: 'TRIAL_EXPIRING',
      dedupeKey: `TRIAL_EXPIRING:${row.id}`,
      tenantId: row.id,
      severity: 'LOW' as const,
      title: `${row.businessName}'s trial ends ${new Date(row.trialEndsAt).toLocaleDateString()}`,
      description: null,
      metadata: { trialEndsAt: row.trialEndsAt },
    }));
  }

  private async upsertMatches(matches: AlertMatch[]): Promise<void> {
    await Promise.all(
      matches.map((match) =>
        this.dataSource.query(
          `INSERT INTO platform_alerts
             (type, dedupe_key, tenant_id, severity, status, title, description, metadata, first_seen_at, last_seen_at)
           VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, NOW(3), NOW(3))
           ON DUPLICATE KEY UPDATE
             last_seen_at = NOW(3),
             status = IF(status = 'RESOLVED', 'OPEN', status),
             resolved_at = IF(status = 'RESOLVED', NULL, resolved_at),
             resolved_by = IF(status = 'RESOLVED', NULL, resolved_by),
             severity = VALUES(severity),
             title = VALUES(title),
             description = VALUES(description),
             metadata = VALUES(metadata)`,
          [
            match.type,
            match.dedupeKey,
            match.tenantId,
            match.severity,
            match.title,
            match.description,
            match.metadata ? JSON.stringify(match.metadata) : null,
          ],
        ),
      ),
    );
  }

  private async autoResolveStale(matches: AlertMatch[]): Promise<void> {
    const currentKeys = matches.map((m) => m.dedupeKey);

    if (currentKeys.length === 0) {
      await this.dataSource.query(
        `UPDATE platform_alerts SET status = 'RESOLVED', resolved_at = NOW(3)
          WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING')`,
      );
      return;
    }

    await this.dataSource.query(
      `UPDATE platform_alerts SET status = 'RESOLVED', resolved_at = NOW(3)
        WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING')
          AND dedupe_key NOT IN (${currentKeys.map(() => '?').join(', ')})`,
      currentKeys,
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private toResponse(entity: PlatformAlertEntity, tenantName: string | null): PlatformAlertResponse {
    return {
      id: entity.id,
      type: entity.type,
      tenantId: entity.tenantId,
      tenantName,
      severity: entity.severity,
      status: entity.status,
      title: entity.title,
      description: entity.description,
      metadata: entity.metadata,
      firstSeenAt: entity.firstSeenAt.toISOString(),
      lastSeenAt: entity.lastSeenAt.toISOString(),
      acknowledgedAt: entity.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: entity.resolvedAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  /** Same raw-insert pattern every platform-* service uses for `audit_logs` — see
   * `PlatformTenantService`'s own doc comment on why this can't go through `.save()`. */
  private async audit(actor: AuditActor, action: string, alertId: string, tenantId: string | null): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO audit_logs
         (tenant_id, actor_type, actor_id, actor_email, action, entity_type, entity_id, severity)
       VALUES (?, 'PLATFORM_ADMIN', ?, NULL, ?, 'PlatformAlert', ?, 'INFO')`,
      [tenantId, actor.id, action, alertId],
    );
  }
}
