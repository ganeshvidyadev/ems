import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_QUEUE_CLIENT } from '../../common/redis/redis.module';
import { SalesRollupService } from '../../modules/report/sales-rollup.service';
import { QUEUE_SETTINGS, QueueName } from '../queue-names.enum';
import { QueueRegistry } from '../queue.registry';

const NIGHTLY_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface RollupJobData {
  eventType?: string;
  tenantId?: string | null;
  payload?: Record<string, unknown>;
}

function yesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Keeps `daily_sales_rollup` current: a nightly sweep recomputes yesterday
 * for every active (tenant, store), and each `order.placed` event (already
 * routed here by `EVENT_ROUTING`'s `order.` prefix) recomputes *today*'s
 * bucket for that one store so same-day dashboards aren't a full day stale.
 *
 * Recomputing the whole day rather than incrementing a counter is what makes
 * both paths safe to run concurrently and safe to redeliver — see
 * `SalesRollupService`'s own doc comment.
 *
 * Known gap, honestly scoped: a refund completed *today* is only reflected
 * once the nightly sweep next runs, since no `return.*`/`refund.*` event is
 * emitted anywhere yet to trigger a same-day recompute (a pre-existing gap
 * across the whole outbox, not something this phase introduces — see the
 * commit that first wired `order.placed`/`shipment.*`).
 */
@Injectable()
export class AnalyticsRollupProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AnalyticsRollupProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_QUEUE_CLIENT) private readonly connection: Redis,
    private readonly rollupService: SalesRollupService,
    private readonly queues: QueueRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.EMS_ROLE !== 'worker') return;

    const settings = QUEUE_SETTINGS[QueueName.ANALYTICS_ROLLUP];
    this.worker = new Worker<RollupJobData>(QueueName.ANALYTICS_ROLLUP, (job) => this.handle(job), {
      connection: this.connection,
      concurrency: settings.concurrency,
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Rollup job ${job?.id ?? '?'} failed: ${error.message}`);
    });

    const queue = this.queues.get(QueueName.ANALYTICS_ROLLUP);
    void queue.add('nightly-sweep', {}, { repeat: { every: NIGHTLY_INTERVAL_MS }, jobId: 'analytics-nightly-sweep' });

    this.logger.log(`Analytics rollup worker listening (concurrency ${settings.concurrency})`);
  }

  private async handle(job: Job<RollupJobData>): Promise<void> {
    if (job.name === 'nightly-sweep') return this.runNightlySweep();

    const eventType = job.data.eventType;
    if (!eventType?.startsWith('order.')) return; // routed here by prefix but not one we recompute for

    const tenantId = job.data.tenantId;
    const storeId = job.data.payload?.['storeId'] as string | undefined;
    if (!tenantId || !storeId) {
      this.logger.warn(`Rollup job for ${eventType} missing tenantId/storeId; skipping`);
      return;
    }

    await this.rollupService.computeForStoreDate(tenantId, storeId, today());
  }

  private async runNightlySweep(): Promise<void> {
    const stores = await this.rollupService.listActiveStores();
    const date = yesterday();
    let done = 0;

    for (const { tenantId, storeId } of stores) {
      try {
        await this.rollupService.computeForStoreDate(tenantId, storeId, date);
        done += 1;
      } catch (error) {
        this.logger.error(
          `Rollup failed for store ${storeId} (${date}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(`Nightly rollup sweep: ${done}/${stores.length} store(s) for ${date}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
