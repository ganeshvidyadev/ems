import { Injectable } from '@nestjs/common';
import type { JobResponse } from '@ems/contracts';
import type { JobRunEntity } from '../../database/entities';
import { JobRepository } from './job.repository';

@Injectable()
export class JobService {
  constructor(private readonly jobs: JobRepository) {}

  async get(id: string): Promise<JobRunEntity> {
    return this.jobs.findByIdOrFail(id);
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
