import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { JobRunEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class JobRepository extends TenantScopedRepository<JobRunEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, JobRunEntity, context, 'tenantId');
  }

  async findByIdOrFail(id: string): Promise<JobRunEntity> {
    return this.findOneOrFail({ where: { id } });
  }
}
