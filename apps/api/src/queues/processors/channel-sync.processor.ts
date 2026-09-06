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
import { runAsTenant } from '../../common/utils/run-as-tenant.util';
import { ChannelRepository } from '../../modules/channel/channel.repository';
import { ChannelTokenService } from '../../modules/channel/channel-token.service';
import { InventorySyncService } from '../../modules/channel/inventory-sync.service';
import { OrderImportService } from '../../modules/channel/order-import.service';
import { QUEUE_SETTINGS, QueueName } from '../queue-names.enum';
import { QueueRegistry } from '../queue.registry';

const TOKEN_EXPIRY_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const ORDER_IMPORT_SCAN_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes — a typical marketplace polling cadence
/** How far ahead of actual expiry the sweep even bothers looking — `ChannelTokenService`'s own window decides whether to act. */
const TOKEN_EXPIRY_LOOKAHEAD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface ChannelJobData {
  channelId: string;
}

/**
 * Runs channel inventory sync, order import and token refresh. Same shape as
 * `DomainVerificationProcessor`: worker-only, and every per-channel job
 * resolves that channel's tenant once (a legitimate cross-tenant lookup)
 * then switches context to it before calling into the tenant-scoped
 * services, so `InventorySyncService`/`OrderImportService`/`ChannelTokenService`
 * never have to know they're running from a queue rather than a request.
 */
@Injectable()
export class ChannelSyncProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ChannelSyncProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_QUEUE_CLIENT) private readonly connection: Redis,
    private readonly channels: ChannelRepository,
    private readonly inventorySync: InventorySyncService,
    private readonly orderImport: OrderImportService,
    private readonly tokenService: ChannelTokenService,
    private readonly context: RequestContextService,
    private readonly queues: QueueRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.EMS_ROLE !== 'worker') return;

    const settings = QUEUE_SETTINGS[QueueName.CHANNEL_SYNC];
    this.worker = new Worker(QueueName.CHANNEL_SYNC, (job) => this.handle(job), {
      connection: this.connection,
      concurrency: settings.concurrency,
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Channel sync job ${job?.id ?? '?'} (${job?.name ?? '?'}) failed: ${error.message}`);
    });

    const queue = this.queues.get(QueueName.CHANNEL_SYNC);
    void queue.add('scan-token-expiry', {}, { repeat: { every: TOKEN_EXPIRY_SCAN_INTERVAL_MS }, jobId: 'channel-token-expiry-scan' });
    void queue.add('scan-auto-import', {}, { repeat: { every: ORDER_IMPORT_SCAN_INTERVAL_MS }, jobId: 'channel-order-import-scan' });

    this.logger.log(`Channel sync worker listening (concurrency ${settings.concurrency})`);
  }

  private async handle(job: Job): Promise<void> {
    switch (job.name) {
      case 'sync-inventory':
        return this.runForChannel((job as Job<ChannelJobData>).data.channelId, (id) => this.inventorySync.syncChannel(id));
      case 'import-orders':
        return this.runForChannel((job as Job<ChannelJobData>).data.channelId, (id) => this.orderImport.importNextPage(id));
      case 'refresh-token':
        return this.runForChannel((job as Job<ChannelJobData>).data.channelId, (id) => this.tokenService.checkAndRefresh(id));
      case 'scan-token-expiry':
        return this.scanTokenExpiry();
      case 'scan-auto-import':
        return this.scanAutoImport();
      default:
        this.logger.warn(`Unrecognized channel-sync job name: ${job.name}`);
    }
  }

  private async runForChannel(channelId: string, work: (channelId: string) => Promise<unknown>): Promise<void> {
    if (!channelId) {
      this.logger.warn('Channel sync job is missing channelId; discarding');
      return;
    }
    const channel = await this.channels.findByIdGlobal(channelId);
    if (!channel) {
      this.logger.warn(`Channel ${channelId} no longer exists; discarding job`);
      return;
    }
    await runAsTenant(this.context, channel.tenantId, () => work(channelId));
  }

  /** Cross-tenant scan (no single tenant context) — fans out one `refresh-token` job per channel whose token is due soon. */
  private async scanTokenExpiry(): Promise<void> {
    const cutoff = new Date(Date.now() + TOKEN_EXPIRY_LOOKAHEAD_MS);
    const due = await this.channels.findConnectedWithTokenExpiringBy(cutoff);
    for (const channel of due) {
      await this.queues.get(QueueName.CHANNEL_SYNC).add('refresh-token', { channelId: channel.id });
    }
    if (due.length > 0) this.logger.log(`Token-expiry scan enqueued ${due.length} channel(s)`);
  }

  /** Cross-tenant scan — fans out one `import-orders` job per channel with auto-import enabled. */
  private async scanAutoImport(): Promise<void> {
    const channels = await this.channels.findAllConnectedWithAutoImport();
    for (const channel of channels) {
      await this.queues.get(QueueName.CHANNEL_SYNC).add('import-orders', { channelId: channel.id });
    }
    if (channels.length > 0) this.logger.log(`Order-import scan enqueued ${channels.length} channel(s)`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
