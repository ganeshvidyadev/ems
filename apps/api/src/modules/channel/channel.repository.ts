import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ChannelEntity, type ChannelType } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class ChannelRepository extends TenantScopedRepository<ChannelEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ChannelEntity, context);
  }

  /** Single-entity `save` — the inherited `save(T | T[])` union return type otherwise forces a cast at every call site. */
  async saveOne(entity: ChannelEntity): Promise<ChannelEntity> {
    return (await this.save(entity)) as ChannelEntity;
  }

  async findByStoreAndType(storeId: string, type: ChannelType): Promise<ChannelEntity | null> {
    return this.findOne({ where: { storeId, type } });
  }

  async listForStore(storeId: string): Promise<ChannelEntity[]> {
    return this.find({ where: { storeId }, order: { createdAt: 'ASC' } });
  }

  /** Cross-tenant — the token-expiry sweep's own worklist, run from a system context with no single tenant. */
  async findConnectedWithTokenExpiringBy(cutoff: Date): Promise<ChannelEntity[]> {
    return this.manager
      .getRepository(ChannelEntity)
      .createQueryBuilder('c')
      .where('c.status IN (:...statuses)', { statuses: ['CONNECTED', 'TOKEN_EXPIRED'] })
      .andWhere('c.tokenExpiresAt IS NOT NULL AND c.tokenExpiresAt <= :cutoff', { cutoff })
      .getMany();
  }

  /** Cross-tenant — every channel with auto-import enabled, the order-import sweep's worklist. */
  async findAllConnectedWithAutoImport(): Promise<ChannelEntity[]> {
    return this.manager.getRepository(ChannelEntity).find({
      where: { status: 'CONNECTED', autoImportOrders: true },
    });
  }

  /** Cross-tenant, by internal id — used by queue processors that only carry a channel id, not a tenant-scoped call. */
  async findByIdGlobal(id: string): Promise<ChannelEntity | null> {
    return this.manager.getRepository(ChannelEntity).findOne({ where: { id } });
  }
}
