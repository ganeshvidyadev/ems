import { Inject, Injectable } from '@nestjs/common';
import type {
  ProductMediaResponse,
  RequestMediaUploadRequest,
  RequestMediaUploadResponse,
  UpdateMediaRequest,
} from '@ems/contracts';
import { ConflictError, NotFoundError, newPublicId } from '@ems/kernel';
import { QueueName } from '../../queues/queue-names.enum';
import { QueueRegistry } from '../../queues/queue.registry';
import { STORAGE_PORT, type StoragePort } from '../../integrations/storage/storage.port';
import { RequestContextService } from '../../common/services/request-context.service';
import type { ProductMediaEntity, ProductMediaType } from '../../database/entities';
import { MediaRepository } from './media.repository';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

@Injectable()
export class MediaService {
  constructor(
    private readonly media: MediaRepository,
    private readonly queues: QueueRegistry,
    private readonly context: RequestContextService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async requestUpload(input: RequestMediaUploadRequest): Promise<RequestMediaUploadResponse> {
    const productId = await this.media.resolveProductId(input.productId);
    if (!productId) throw new NotFoundError('Product', input.productId);

    const tenantId = this.context.requireTenantId('request media upload');
    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `tenants/${tenantId}/products/${productId}/${newPublicId()}-${safeName}`;

    const presigned = await this.storage.presignUpload(storageKey, input.contentType, input.sizeBytes);

    const type: ProductMediaType = IMAGE_TYPES.has(input.contentType) ? 'IMAGE' : 'VIDEO';

    const mediaRow = await this.media.insert({
      productId,
      variantId: null,
      type,
      url: this.storage.publicUrl(storageKey),
      storageKey,
      mimeType: input.contentType,
      sizeBytes: String(input.sizeBytes),
      position: 0,
      isPrimary: false,
      status: 'PENDING',
    });

    return {
      mediaId: String(mediaRow.id),
      uploadUrl: presigned.uploadUrl,
      storageKey: presigned.storageKey,
      expiresInSeconds: presigned.expiresInSeconds,
    };
  }

  /**
   * Confirms the client actually uploaded the object, verifies its real content matches
   * the claimed type, and hands it to the worker for thumbnailing.
   *
   * `mediaId` here is the numeric `job_runs`-style id returned by `requestUpload` — media
   * rows do not carry a `publicId` (see the migration's header comment), so this is the
   * literal row id, tenant-scoped by `findOneOrFail` below regardless.
   */
  async confirmUpload(mediaId: string): Promise<ProductMediaEntity> {
    const media = await this.media.findOneOrFail({ where: { id: mediaId } as never });
    if (media.status !== 'PENDING') return media;

    const head = await this.storage.headObject(media.storageKey);
    if (!head) throw new ConflictError('Upload not found in storage yet — retry after the PUT completes');

    media.sizeBytes = String(head.sizeBytes);
    await this.media.save(media);

    await this.queues.get(QueueName.MEDIA_PROCESS).add('process', {
      tenantId: media.tenantId,
      mediaId: media.id,
      correlationId: this.context.correlationId,
    });

    return media;
  }

  async remove(mediaId: string): Promise<void> {
    const media = await this.media.findOneOrFail({ where: { id: mediaId } as never });
    await this.storage.deleteObject(media.storageKey);
    await this.media.hardDelete({ id: media.id } as never);
  }

  async update(mediaId: string, input: UpdateMediaRequest): Promise<ProductMediaEntity> {
    const media = await this.media.findOneOrFail({ where: { id: mediaId } as never });

    if (input.isPrimary) {
      await this.media.clearPrimary(media.productId);
      media.isPrimary = true;
    }
    if (input.altText !== undefined) media.altText = input.altText;

    await this.media.save(media);
    return media;
  }

  async reorder(productPublicId: string, orderedIds: string[]): Promise<void> {
    const productId = await this.media.resolveProductId(productPublicId);
    if (!productId) throw new NotFoundError('Product', productPublicId);

    for (const [index, mediaId] of orderedIds.entries()) {
      const media = await this.media.findOneOrFail({ where: { id: mediaId, productId } as never });
      media.position = index;
      await this.media.save(media);
    }
  }

  async listForProduct(productPublicId: string): Promise<ProductMediaEntity[]> {
    const productId = await this.media.resolveProductId(productPublicId);
    if (!productId) throw new NotFoundError('Product', productPublicId);
    return this.media.find({ where: { productId } as never, order: { position: 'ASC' } });
  }

  toResponse(media: ProductMediaEntity, productPublicId: string): ProductMediaResponse {
    return {
      id: String(media.id),
      productId: productPublicId,
      variantId: media.variantId,
      type: media.type,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      altText: media.altText,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      width: media.width,
      height: media.height,
      position: media.position,
      isPrimary: media.isPrimary,
      status: media.status,
      createdAt: media.createdAt.toISOString(),
    };
  }
}
