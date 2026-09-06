import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { stringify } from 'csv-stringify/sync';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import type { EntityManager } from 'typeorm';
import { REDIS_QUEUE_CLIENT } from '../../common/redis/redis.module';
import { RequestContextService } from '../../common/services/request-context.service';
import { STORAGE_PORT, type StoragePort } from '../../integrations/storage/storage.port';
import { JobRunEntity } from '../../database/entities';
import { ReportService } from '../../modules/report/report.service';
import type { ReportGenerationJobData } from '../../modules/report/report-generation.service';
import { QUEUE_SETTINGS, QueueName } from '../queue-names.enum';

/** Same shape as `ProductImportProcessor`: re-opens tenant context, delegates the actual work, writes progress back to `job_runs`. */
@Injectable()
export class ReportGenerationProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReportGenerationProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_QUEUE_CLIENT) private readonly connection: Redis,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly context: RequestContextService,
    private readonly reports: ReportService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.EMS_ROLE !== 'worker') return;

    const settings = QUEUE_SETTINGS[QueueName.REPORT_GENERATION];
    this.worker = new Worker<ReportGenerationJobData>(QueueName.REPORT_GENERATION, (job) => this.handle(job), {
      connection: this.connection,
      concurrency: settings.concurrency,
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Report job ${job?.id ?? '?'} failed: ${error.message}`);
    });

    this.logger.log(`Report generation worker listening (concurrency ${settings.concurrency})`);
  }

  private async handle(job: Job<ReportGenerationJobData>): Promise<void> {
    if (job.name !== 'generate-report') return;
    const { jobId, tenantId, type, from, to, storeId, format, correlationId } = job.data;

    await this.context.run(
      { correlationId: correlationId ?? `report-${job.id}`, tenantId, surface: 'system', startedAt: Date.now() },
      async () => {
        const jobRepo = this.manager.getRepository(JobRunEntity);
        const jobRun = await jobRepo.findOne({ where: { id: jobId, tenantId } });
        if (!jobRun) return;

        jobRun.status = 'RUNNING';
        jobRun.startedAt = new Date();
        await jobRepo.save(jobRun);

        try {
          const table = await this.reports.buildTable(type, tenantId, from, to, storeId);
          jobRun.totalRows = table.rows.length;

          const key = `tenants/${tenantId}/reports/${jobId}.${format.toLowerCase()}`;
          if (format === 'CSV') {
            const csv = stringify([table.header, ...table.rows]);
            await this.storage.putObject(key, Buffer.from(csv, 'utf-8'), 'text/csv');
          } else {
            const json = JSON.stringify(table.rows.map((row) => Object.fromEntries(table.header.map((h, i) => [h, row[i]]))));
            await this.storage.putObject(key, Buffer.from(json, 'utf-8'), 'application/json');
          }

          jobRun.outputUrl = await this.storage.presignDownload(key, 86_400);
          jobRun.processedRows = table.rows.length;
          jobRun.successRows = table.rows.length;
          jobRun.status = 'COMPLETED';
        } catch (error) {
          jobRun.status = 'FAILED';
          jobRun.errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
          this.logger.error(`Report ${jobId} (${type}) failed: ${jobRun.errorMessage}`);
        }

        jobRun.finishedAt = new Date();
        await jobRepo.save(jobRun);
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
