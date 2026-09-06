import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { LoyaltyTransactionEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class LoyaltyTransactionRepository extends TenantScopedRepository<LoyaltyTransactionEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, LoyaltyTransactionEntity, context);
  }

  async listByCustomer(customerId: string, page: number, limit: number) {
    return this.findAndCount({
      where: { customerId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
