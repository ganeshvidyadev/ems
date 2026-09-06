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
import { DomainRepository } from '../../modules/domain/domain.repository';
import { DomainService } from '../../modules/domain/domain.service';
import { QUEUE_SETTINGS, QueueName } from '../queue-names.enum';
import { QueueRegistry } from '../queue.registry';

const RENEWAL_SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000; // twice a day
const RENEWAL_WINDOW_DAYS = 30; // matches idx_tenant_domains_ssl_expiry's intended query pattern

interface DomainJobData {
  tenantId: string;
  domainId: string;
}

/**
 * Runs custom-domain ownership verification (backoff re-checks) and SSL
 * issuance/renewal. Same shape as `ProvisioningProcessor`: worker-only,
 * thin, and delegates all state and idempotency to `DomainService` so a
 * queued retry and a merchant clicking "Verify now" go through identical
 * logic.
 */
@Injectable()
export class DomainVerificationProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DomainVerificationProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_QUEUE_CLIENT) private readonly connection: Redis,
    private readonly domainService: DomainService,
    private readonly domains: DomainRepository,
    private readonly context: RequestContextService,
    private readonly queues: QueueRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.EMS_ROLE !== 'worker') return;

    const settings = QUEUE_SETTINGS[QueueName.DOMAIN_VERIFICATION];

    this.worker = new Worker(QueueName.DOMAIN_VERIFICATION, (job) => this.handle(job), {
      connection: this.connection,
      concurrency: settings.concurrency,
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Domain verification job ${job?.id ?? '?'} (${job?.name ?? '?'}) failed: ${error.message}`);
    });

    // A fixed `jobId` makes this idempotent to re-register: BullMQ replaces the
    // existing repeatable job's schedule rather than stacking a second one.
    void this.queues
      .get(QueueName.DOMAIN_VERIFICATION)
      .add('scan-renewals', {}, { repeat: { every: RENEWAL_SCAN_INTERVAL_MS }, jobId: 'domain-renewal-scan' });

    this.logger.log(`Domain verification worker listening (concurrency ${settings.concurrency})`);
  }

  private async handle(job: Job): Promise<void> {
    switch (job.name) {
      case 'verify-ownership':
        return this.runInTenantContext(job as Job<DomainJobData>, (domainId) =>
          this.domainService.performOwnershipCheck(domainId),
        );
      case 'issue-certificate':
        return this.runInTenantContext(job as Job<DomainJobData>, (domainId) =>
          this.domainService.issueCertificateNow(domainId),
        );
      case 'scan-renewals':
        return this.scanRenewals();
      default:
        this.logger.warn(`Unrecognized domain-verification job name: ${job.name}`);
    }
  }

  private async runInTenantContext(job: Job<DomainJobData>, work: (domainId: string) => Promise<unknown>): Promise<void> {
    const { tenantId, domainId } = job.data;
    if (!tenantId || !domainId) {
      this.logger.warn(`Domain job ${job.id} is missing tenantId/domainId; discarding`);
      return;
    }

    await this.context.run(
      {
        correlationId: `domain-${job.id}`,
        tenantId,
        surface: 'system',
        startedAt: Date.now(),
        causationId: null,
      },
      async () => {
        await work(domainId);
      },
    );
  }

  /** Cross-tenant scan (no single tenant context) — fans out one `issue-certificate` job per domain due for renewal. */
  private async scanRenewals(): Promise<void> {
    const due = await this.domains.findDueForRenewal(RENEWAL_WINDOW_DAYS);
    for (const domain of due) {
      await this.queues
        .get(QueueName.DOMAIN_VERIFICATION)
        .add('issue-certificate', { tenantId: domain.tenantId, domainId: domain.id });
    }
    if (due.length > 0) this.logger.log(`Renewal scan enqueued ${due.length} domain(s)`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
