import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { SettlementEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

/**
 * `beneficiaryTenantId`, not the default `tenantId` — every settlement row
 * genuinely belongs to one tenant, just not through the usual column name.
 * See `SettlementEntity`'s own doc comment.
 */
@Injectable()
export class SettlementRepository extends TenantScopedRepository<SettlementEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, SettlementEntity, context, 'beneficiaryTenantId');
  }

  async findByNumber(settlementNumber: string): Promise<SettlementEntity | null> {
    return this.manager.getRepository(SettlementEntity).findOne({ where: { settlementNumber } });
  }

  async existsForPeriod(beneficiaryTenantId: string, periodStart: string, periodEnd: string): Promise<boolean> {
    const count = await this.manager
      .getRepository(SettlementEntity)
      .count({ where: { beneficiaryTenantId, periodStart, periodEnd } });
    return count > 0;
  }

  /** Cross-tenant — the platform settlement-administration queue. */
  async findAllByStatus(status: SettlementEntity['status']): Promise<SettlementEntity[]> {
    return this.manager.getRepository(SettlementEntity).find({ where: { status }, order: { periodEnd: 'ASC' } });
  }

  /** Cross-tenant, by public id — the platform admin's "open one settlement" read, unscoped by design. */
  async findByPublicIdGlobal(publicId: string): Promise<SettlementEntity | null> {
    return this.manager.getRepository(SettlementEntity).findOne({ where: { publicId } });
  }

  /** For the API response mapper — resolves an internal tenant id to what the API is allowed to show for it. */
  async tenantPublicInfo(tenantId: string): Promise<{ publicId: string; businessName: string } | null> {
    const rows = (await this.manager.query(
      `SELECT public_id AS publicId, business_name AS businessName FROM tenants WHERE id = ? LIMIT 1`,
      [tenantId],
    )) as { publicId: string; businessName: string }[];
    return rows[0] ?? null;
  }
}
