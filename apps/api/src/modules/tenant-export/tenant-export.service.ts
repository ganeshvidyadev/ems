import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { NotFoundError } from '@ems/kernel';
import { JobRunEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { QueueName } from '../../queues/queue-names.enum';
import { QueueRegistry } from '../../queues/queue.registry';

export interface TenantExportJobData {
  jobId: string;
  tenantId: string;
  correlationId?: string | null;
}

/**
 * The data-portability half of the Phase 12 exit criterion: "per-tenant
 * logical export for data-portability requests" — a merchant (or a support
 * agent acting for one, or a regulator-driven request) can get every row
 * this tenant owns as a single downloadable archive.
 *
 * Async via the existing `IMPORT_EXPORT` queue and `job_runs` tracking — the
 * same shape `ProductImportProcessor` already established, not a new
 * pattern. `TenantExportProcessor` (queues/processors) does the actual
 * per-table export.
 */
@Injectable()
export class TenantExportService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly context: RequestContextService,
    private readonly queues: QueueRegistry,
  ) {}

  async enqueue(tenantPublicId: string): Promise<{ jobId: string; status: string }> {
    const [tenant] = (await this.manager.query('SELECT id FROM tenants WHERE public_id = ?', [tenantPublicId])) as {
      id: string;
    }[];
    if (!tenant) throw new NotFoundError('Tenant', tenantPublicId);

    const jobRun = await this.manager.save(
      this.manager.create(JobRunEntity, {
        tenantId: tenant.id,
        jobType: 'tenant-export',
        status: 'QUEUED',
        inputParams: { tenantPublicId },
        requestedBy: this.context.userId,
        correlationId: this.context.correlationId ?? null,
      }),
    );

    const jobData: TenantExportJobData = {
      jobId: jobRun.id,
      tenantId: tenant.id,
      correlationId: this.context.correlationId ?? null,
    };

    await this.queues.get(QueueName.TENANT_EXPORT).add('tenant-export', jobData);

    return { jobId: jobRun.id, status: jobRun.status };
  }
}
