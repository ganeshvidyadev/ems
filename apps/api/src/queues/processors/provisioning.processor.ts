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
import { RequestContextService } from '../../common/services/request-context.service';
import { ProvisioningService } from '../../modules/provisioning/provisioning.service';
import { QUEUE_SETTINGS, QueueName } from '../queue-names.enum';

interface ProvisioningJobData {
  tenantId?: string;
  /** Present when the job came from the outbox relay rather than a direct enqueue. */
  eventType?: string;
  eventId?: string;
  correlationId?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Runs the provisioning saga.
 *
 * Started only in the worker process (`worker.ts`). The API registers the module so it can
 * read status and trigger a retry inline, but it must not also consume the queue — N API
 * replicas would each pick up jobs and race each other through the same tenant's steps.
 *
 * The processor is intentionally thin: it re-opens the tenant context and delegates.
 * All idempotency, claiming and resumption live in `ProvisioningService`, so the same
 * logic runs whether a job triggered it or a merchant clicked Retry.
 */
@Injectable()
export class ProvisioningProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ProvisioningProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_QUEUE_CLIENT) private readonly connection: Redis,
    private readonly provisioning: ProvisioningService,
    private readonly context: RequestContextService,
  ) {}

  onApplicationBootstrap(): void {
    // Only the worker bootstrap sets this. Guarding here rather than in the module keeps
    // the module graph identical between the two entrypoints.
    if (process.env.EMS_ROLE !== 'worker') return;

    const settings = QUEUE_SETTINGS[QueueName.PROVISIONING];

    this.worker = new Worker<ProvisioningJobData>(
      QueueName.PROVISIONING,
      async (job) => this.handle(job),
      {
        connection: this.connection,
        concurrency: settings.concurrency,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Provisioning job ${job?.id ?? '?'} failed: ${error.message}`,
      );
    });

    this.logger.log(`Provisioning worker listening (concurrency ${settings.concurrency})`);
  }

  /**
   * Event types that should start the saga.
   *
   * The `tenant.` and `subscription.` prefixes both route here, but provisioning must begin
   * when a **plan is chosen**, not at registration — otherwise every abandoned signup would
   * get a fully built store, subdomain and warehouse it never paid for.
   *
   * A direct enqueue (no `eventType`) always runs; that is the retry path.
   */
  private static readonly TRIGGERS = new Set(['subscription.started']);

  private async handle(job: Job<ProvisioningJobData>): Promise<void> {
    const eventType = job.data.eventType;

    if (eventType && !ProvisioningProcessor.TRIGGERS.has(eventType)) {
      // Routed here by prefix but not a trigger. Returning cleanly (rather than throwing)
      // marks the job complete so it is not retried forever.
      return;
    }

    const tenantId =
      job.data.tenantId ??
      (job.data.payload?.['tenantId'] as string | undefined) ??
      null;

    if (!tenantId) {
      // Not retryable — a job with no tenant will never acquire one. Logged and dropped
      // rather than retried five times against nothing.
      this.logger.warn(`Provisioning job ${job.id} has no tenantId; discarding`);
      return;
    }

    // The job carries the context because there is no HTTP request here. Without this the
    // tenant-scoped repositories inside the saga would have no tenant to filter on.
    await this.context.run(
      {
        correlationId: job.data.correlationId ?? `provisioning-${job.id}`,
        tenantId,
        surface: 'system',
        startedAt: Date.now(),
        causationId: job.data.eventId ?? null,
      },
      async () => {
        const complete = await this.provisioning.run(tenantId);

        if (!complete) {
          // Thrown so BullMQ applies its backoff and retries. The saga itself is already
          // idempotent, so a retry resumes rather than restarts.
          throw new Error(`Provisioning incomplete for tenant ${tenantId}`);
        }

        this.logger.log(`Tenant ${tenantId} provisioned`);
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    // Close waits for in-flight jobs, so a step is not abandoned mid-transaction.
    await this.worker?.close();
  }
}
