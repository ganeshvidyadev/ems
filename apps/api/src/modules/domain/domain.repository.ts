import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { IsNull, type EntityManager } from 'typeorm';
import { TenantDomainEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class DomainRepository extends TenantScopedRepository<TenantDomainEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, TenantDomainEntity, context);
  }

  async findByHostname(hostname: string): Promise<TenantDomainEntity | null> {
    return this.findOne({ where: { hostname } });
  }

  /** Global lookup, no tenant filter — used to enforce the platform-wide hostname uniqueness constraint pre-insert. */
  async findByHostnameGlobal(hostname: string): Promise<TenantDomainEntity | null> {
    return this.manager.getRepository(TenantDomainEntity).findOne({ where: { hostname } });
  }

  async listForTenant(): Promise<TenantDomainEntity[]> {
    return this.find({ order: { createdAt: 'ASC' } });
  }

  /** Every verified custom domain whose certificate is due within `withinDays` — the renewal cron's query. */
  async findDueForRenewal(withinDays: number): Promise<TenantDomainEntity[]> {
    const cutoff = new Date(Date.now() + withinDays * 86_400_000);
    return this.manager
      .getRepository(TenantDomainEntity)
      .createQueryBuilder('d')
      .where('d.type = :type', { type: 'CUSTOM' })
      .andWhere('d.sslStatus = :status', { status: 'ACTIVE' })
      .andWhere('d.sslExpiresAt IS NOT NULL AND d.sslExpiresAt <= :cutoff', { cutoff })
      .getMany();
  }

  async resolveStoreId(storePublicId: string): Promise<string | null> {
    const rows = await this.manager.query(`SELECT id FROM stores WHERE public_id = ? AND tenant_id = ? LIMIT 1`, [
      storePublicId,
      this.tenantId,
    ]);
    return (rows as { id: string }[])[0]?.id ?? null;
  }

  async defaultStoreId(): Promise<string | null> {
    const rows = await this.manager.query(`SELECT id FROM stores WHERE tenant_id = ? ORDER BY id ASC LIMIT 1`, [
      this.tenantId,
    ]);
    return (rows as { id: string }[])[0]?.id ?? null;
  }

  /** Every live custom domain, across every tenant — the nginx/ALB config generator's input. */
  async findAllLiveCustomDomains(): Promise<TenantDomainEntity[]> {
    return this.manager.getRepository(TenantDomainEntity).find({
      where: { type: 'CUSTOM', sslStatus: 'ACTIVE' },
      order: { hostname: 'ASC' },
    });
  }

  /** Custom domains still awaiting ownership verification — resume-on-restart admin/diagnostic use. */
  async findPendingOwnership(): Promise<TenantDomainEntity[]> {
    return this.manager.getRepository(TenantDomainEntity).find({
      where: { type: 'CUSTOM', verifiedAt: IsNull() },
    });
  }
}
