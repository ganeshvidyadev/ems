import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { NotFoundError } from '@ems/kernel';
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

  /**
   * Platform lookup by id, any tenant (or none — a job a platform user
   * themself triggered, like a tenant-export, has no tenant context of its
   * own to scope against). Bypasses the tenant filter via the raw repository,
   * same as `SupportTicketRepository.findByPublicIdAcrossTenantsOrFail`.
   */
  async findByIdAcrossTenantsOrFail(id: string): Promise<JobRunEntity> {
    const job = await this.repository.findOne({ where: { id } });
    if (!job) throw new NotFoundError('Job', id);
    return job;
  }
}
