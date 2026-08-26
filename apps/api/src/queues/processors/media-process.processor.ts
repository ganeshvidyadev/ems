import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import sharp from 'sharp';
import type { EntityManager } from 'typeorm';
import { REDIS_QUEUE_CLIENT } from '../../common/redis/redis.module';
import { RequestContextService } from '../../common/services/request-context.service';
import { STORAGE_PORT, type StoragePort } from '../../integrations/storage/storage.port';
import { ProductMediaEntity } from '../../database/entities';
import { QueueName, QUEUE_SETTINGS } from '../queue-names.enum';

interface MediaProcessJobData {
  tenantId: string;
  mediaId: string;
  correlationId?: string | null;
}

const THUMBNAIL_WIDTH = 400;

/**
 * Downloads an uploaded object, strips EXIF (by not re-embedding it — `sharp` drops
 * metadata by default unless `.withMetadata()` is called), and derives a thumbnail.
 *
 * Worker-only, same `EMS_ROLE` guard as `ProvisioningProcessor` — N API replicas racing
 * the same media row would double-process it and double-write the thumbnail.
 */
@Injectable()
export class MediaProcessProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MediaProcessProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_QUEUE_CLIENT) private readonly connection: Redis,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly context: RequestContextService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.EMS_ROLE !== 'worker') return;

    const settings = QUEUE_SETTINGS[QueueName.MEDIA_PROCESS];

    this.worker = new Worker<MediaProcessJobData>(
      QueueName.MEDIA_PROCESS,
      async (job) => this.handle(job),
      { connection: this.connection, concurrency: settings.concurrency },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Media process job ${job?.id ?? '?'} failed: ${error.message}`);
    });

    this.logger.log(`Media processing worker listening (concurrency ${settings.concurrency})`);
  }

  private async handle(job: Job<MediaProcessJobData>): Promise<void> {
    const { tenantId, mediaId } = job.data;

    await this.context.run(
      {
        correlationId: job.data.correlationId ?? `media-${job.id}`,
        tenantId,
        surface: 'system',
        startedAt: Date.now(),
      },
      async () => {
        const repo = this.manager.getRepository(ProductMediaEntity);
        const media = await repo.findOne({ where: { id: mediaId, tenantId } });
        if (!media) {
          this.logger.warn(`Media ${mediaId} vanished before processing`);
          return;
        }

        try {
          if (media.type !== 'IMAGE') {
            // Video/3D/document derivatives are out of scope for this phase — mark ready
            // as-is so the upload flow does not dead-end waiting for a thumbnail that
            // will never arrive.
            media.status = 'READY';
            await repo.save(media);
            return;
          }

          const original = await this.storage.getObject(media.storageKey);
          // `.rotate()` with no args auto-orients from the EXIF orientation tag, then the
          // pipeline below never calls `.withMetadata()` — so the tag itself is dropped
          // from every derivative along with GPS/camera metadata.
          const pipeline = sharp(original).rotate();
          const metadata = await pipeline.metadata();

          const thumbnailKey = media.storageKey.replace(/(\.[^./]+)?$/, '-thumb.webp');
          const thumbnailBuffer = await sharp(original)
            .rotate()
            .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

          await this.storage.putObject(thumbnailKey, thumbnailBuffer, 'image/webp');

          media.thumbnailUrl = this.storage.publicUrl(thumbnailKey);
          media.width = metadata.width ?? null;
          media.height = metadata.height ?? null;
          media.status = 'READY';
          await repo.save(media);
        } catch (error) {
          this.logger.error(
            `Failed to process media ${mediaId}: ${error instanceof Error ? error.message : String(error)}`,
          );
          media.status = 'FAILED';
          await repo.save(media);
        }
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
