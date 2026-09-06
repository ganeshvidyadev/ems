import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import type { GenerateReportRequest, GenerateReportResponse } from '@ems/contracts';
import { JobRunEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { QueueName } from '../../queues/queue-names.enum';
import { QueueRegistry } from '../../queues/queue.registry';

export interface ReportGenerationJobData {
  jobId: string;
  tenantId: string;
  type: GenerateReportRequest['type'];
  from: string;
  to: string;
  storeId: string | null;
  format: GenerateReportRequest['format'];
  correlationId?: string | null;
}

/** Creates the durable `job_runs` row and enqueues the actual generation — mirrors `ProductImportService`'s own split. */
@Injectable()
export class ReportGenerationService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly context: RequestContextService,
    private readonly queues: QueueRegistry,
  ) {}

  async enqueue(input: GenerateReportRequest): Promise<GenerateReportResponse> {
    const tenantId = this.context.requireTenantId('report generation');

    const jobRun = await this.manager.save(
      this.manager.create(JobRunEntity, {
        tenantId,
        jobType: `report:${input.type.toLowerCase()}`,
        status: 'QUEUED',
        inputParams: { ...input },
        requestedBy: this.context.userId,
        correlationId: this.context.correlationId ?? null,
      }),
    );

    const jobData: ReportGenerationJobData = {
      jobId: jobRun.id,
      tenantId,
      type: input.type,
      from: input.from,
      to: input.to,
      storeId: input.storeId ?? null,
      format: input.format,
      correlationId: this.context.correlationId ?? null,
    };

    await this.queues.get(QueueName.REPORT_GENERATION).add('generate-report', jobData);

    return { jobId: jobRun.id, status: jobRun.status };
  }
}
