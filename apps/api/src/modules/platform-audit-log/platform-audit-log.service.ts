import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { PlatformAuditLogListQuery, PlatformAuditLogResponse } from '@ems/contracts';
import { AuditLogEntity, TenantEntity } from '../../database/entities';

export interface PlatformAuditLogList {
  items: PlatformAuditLogResponse[];
  total: number;
}

@Injectable()
export class PlatformAuditLogService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(query: PlatformAuditLogListQuery): Promise<PlatformAuditLogList> {
    const qb = this.dataSource.getRepository(AuditLogEntity).createQueryBuilder('a');

    if (query.severity) qb.andWhere('a.severity = :severity', { severity: query.severity });
    if (query.actorType) qb.andWhere('a.actor_type = :actorType', { actorType: query.actorType });
    if (query.entityType) qb.andWhere('a.entity_type = :entityType', { entityType: query.entityType });
    if (query.tenantId) {
      // `audit_logs.tenant_id` is the internal bigint FK — translate the public id
      // the same way `platform-billing.service.ts`'s own `tenantId` filter does.
      //
      // A tenant can be the subject of a row two different ways, and both must
      // match: a platform admin acting ON a tenant (suspend/impersonate/create)
      // has no tenant context of their own, so `PlatformTenantService.audit()`
      // records it as `tenant_id: null, entity_type: 'Tenant', entity_id: <tenant>`
      // instead — `tenant_id` alone would silently miss exactly those rows, which
      // is the majority of what this table currently contains for any tenant.
      const tenant = await this.dataSource
        .getRepository(TenantEntity)
        .findOne({ where: { publicId: query.tenantId } });
      const internalTenantId = tenant?.id ?? '0';
      qb.andWhere(
        '(a.tenant_id = :internalTenantId OR (a.entity_type = :tenantEntityType AND a.entity_id = :internalTenantId))',
        { internalTenantId, tenantEntityType: 'Tenant' },
      );
    }
    if (query.dateFrom) qb.andWhere('a.created_at >= :dateFrom', { dateFrom: `${query.dateFrom} 00:00:00` });
    if (query.dateTo) qb.andWhere('a.created_at <= :dateTo', { dateTo: `${query.dateTo} 23:59:59` });
    if (query.q) {
      qb.andWhere('(a.action LIKE :q OR a.actor_email LIKE :q)', { q: `%${query.q}%` });
    }

    // `created_at` is part of the primary key (partitioning requirement) and every
    // row's realistic sort key — `id` alone can tie or even go backwards across
    // partitions under concurrent inserts.
    qb.orderBy('a.created_at', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((r) => this.toResponse(r)), total };
  }

  private toResponse(row: AuditLogEntity): PlatformAuditLogResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      actorType: row.actorType,
      actorId: row.actorId,
      actorEmail: row.actorEmail,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      beforeState: row.beforeState,
      afterState: row.afterState,
      changedFields: row.changedFields,
      severity: row.severity,
      correlationId: row.correlationId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
