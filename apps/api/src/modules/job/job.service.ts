import { Injectable } from '@nestjs/common';
import type { JobResponse } from '@ems/contracts';
import { RequestContextService } from '../../common/services/request-context.service';
import type { JobRunEntity } from '../../database/entities';
import { JobRepository } from './job.repository';

@Injectable()
export class JobService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly context: RequestContextService,
  ) {}

  async get(id: string): Promise<JobRunEntity> {
    // A platform caller (polling a tenant-export job they themselves queued)
    // has no tenant context to scope against — see `JobRepository`'s own note.
    return this.context.isPlatformRequest
      ? this.jobs.findByIdAcrossTenantsOrFail(id)
      : this.jobs.findByIdOrFail(id);
  }

  toResponse(job: JobRunEntity): JobResponse {
    return {
      id: String(job.id),
      jobType: job.jobType,
      status: job.status,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      successRows: job.successRows,
      failedRows: job.failedRows,
      progressPercent: job.progressPercent,
      errorReportUrl: job.errorReportUrl,
      outputUrl: job.outputUrl,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
    };
  }
}
