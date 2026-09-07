import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import type { EntityManager } from 'typeorm';
import { REDIS_QUEUE_CLIENT } from '../../common/redis/redis.module';
import { RequestContextService } from '../../common/services/request-context.service';
import { STORAGE_PORT, type StoragePort } from '../../integrations/storage/storage.port';
import { JobRunEntity } from '../../database/entities';
import type { TenantExportJobData } from '../../modules/tenant-export/tenant-export.service';
import { QUEUE_SETTINGS, QueueName } from '../queue-names.enum';

/**
 * The tables a tenant's own logical export covers — every table with a
 * direct `tenant_id` column that a merchant would recognize as "my data".
 *
 * Deliberately not exhaustive of every `@TenantScoped()` entity in the
 * codebase (dozens by now): join tables, internal ledgers, and
 * platform-global dual-tenant tables (`product_shares`,
 * `commission_ledger` — see their own doc comments) are out of scope for a
 * first export and are the natural next table to add here, not a reason to
 * withhold the export feature until every one is covered.
 */
const EXPORT_TABLES = [
  'users',
  'stores',
  'products',
  'product_variants',
  'categories',
  'brands',
  'customers',
  'orders',
  'order_items',
  'payments',
  'shipments',
  'returns',
  'coupons',
  'gift_cards',
  'subscriptions',
  'support_tickets',
] as const;

@Injectable()
export class TenantExportProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TenantExportProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_QUEUE_CLIENT) private readonly connection: Redis,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly context: RequestContextService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.EMS_ROLE !== 'worker') return;

    // Its own queue, not IMPORT_EXPORT — see QUEUE_SETTINGS[TENANT_EXPORT]'s
    // own comment for the real bug two workers sharing one queue caused.
    const settings = QUEUE_SETTINGS[QueueName.TENANT_EXPORT];
    this.worker = new Worker<TenantExportJobData>(QueueName.TENANT_EXPORT, (job) => this.handle(job), {
      connection: this.connection,
      concurrency: settings.concurrency,
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Tenant export job ${job?.id ?? '?'} failed: ${error.message}`);
    });

    this.logger.log(`Tenant export worker listening (concurrency ${settings.concurrency})`);
  }

  private async handle(job: Job<TenantExportJobData>): Promise<void> {
    if (job.name !== 'tenant-export') return;
    const { jobId, tenantId, correlationId } = job.data;

    await this.context.run(
      { correlationId: correlationId ?? `tenant-export-${job.id}`, tenantId, surface: 'system', startedAt: Date.now() },
      async () => {
        const jobRepo = this.manager.getRepository(JobRunEntity);
        const jobRun = await jobRepo.findOne({ where: { id: jobId, tenantId } });
        if (!jobRun) return;

        jobRun.status = 'RUNNING';
        jobRun.startedAt = new Date();
        await jobRepo.save(jobRun);

        try {
          const [tenantRow] = (await this.manager.query('SELECT * FROM tenants WHERE id = ?', [tenantId])) as Record<
            string,
            unknown
          >[];

          const bundle: Record<string, unknown> = { exportedAt: new Date().toISOString(), tenant: tenantRow };
          let totalRows = 0;

          for (const table of EXPORT_TABLES) {
            const rows = (await this.manager.query(`SELECT * FROM ${table} WHERE tenant_id = ?`, [tenantId])) as Record<
              string,
              unknown
            >[];
            bundle[table] = rows;
            totalRows += rows.length;
          }

          const key = `tenants/${tenantId}/exports/${jobId}.json`;
          await this.storage.putObject(key, Buffer.from(JSON.stringify(bundle, null, 2), 'utf-8'), 'application/json');

          jobRun.outputUrl = await this.storage.presignDownload(key, 7 * 86_400); // a week — a data-portability request is not usually collected within the hour
          jobRun.totalRows = totalRows;
          jobRun.processedRows = totalRows;
          jobRun.successRows = totalRows;
          jobRun.status = 'COMPLETED';
        } catch (error) {
          jobRun.status = 'FAILED';
          jobRun.errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
          this.logger.error(`Tenant export ${jobId} failed: ${jobRun.errorMessage}`);
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
