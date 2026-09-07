import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { StoreEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class StoreRepository extends TenantScopedRepository<StoreEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, StoreEntity, context);
  }

  /** Every store this tenant has, active ones first — the console has no multi-store switcher yet, so this is what a store picker lists. */
  async listAll(): Promise<StoreEntity[]> {
    return this.find({ order: { status: 'ASC', createdAt: 'ASC' } as never });
  }
}
