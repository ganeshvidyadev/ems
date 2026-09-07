import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { WarehouseEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class WarehouseRepository extends TenantScopedRepository<WarehouseEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, WarehouseEntity, context);
  }

  /** Every warehouse this tenant has, active ones first — what an adjust/transfer form's warehouse picker lists. */
  async listAll(): Promise<WarehouseEntity[]> {
    return this.find({ order: { isActive: 'DESC', priority: 'ASC', createdAt: 'ASC' } as never });
  }
}
