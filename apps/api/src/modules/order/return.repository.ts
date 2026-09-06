import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ReturnEntity, ReturnItemEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class ReturnRepository extends TenantScopedRepository<ReturnEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ReturnEntity, context);
  }

  async findByOrder(orderId: string): Promise<ReturnEntity[]> {
    return this.find({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  generateRmaNumber(): string {
    return `RMA-${Date.now().toString(36).toUpperCase()}`;
  }
}

@Injectable()
export class ReturnItemRepository extends TenantScopedRepository<ReturnItemEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ReturnItemEntity, context);
  }

  async findByReturn(returnId: string): Promise<ReturnItemEntity[]> {
    return this.find({ where: { returnId } });
  }
}
