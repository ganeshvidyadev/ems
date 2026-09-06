import { Injectable } from '@nestjs/common';
import type { BannerResponse, CreateBannerRequest, UpdateBannerRequest } from '@ems/contracts';
import { ConflictError, NotFoundError } from '@ems/kernel';
import type { BannerEntity } from '../../database/entities';
import { BannerRepository } from './banner.repository';

@Injectable()
export class BannerService {
  constructor(private readonly banners: BannerRepository) {}

  async listByPlacement(storePublicId: string, placement: BannerEntity['placement'], liveOnly = false) {
    const storeId = await this.banners.resolveStoreId(storePublicId);
    if (!storeId) return [];
    const rows = await this.banners.findByPlacement(storeId, placement);
    return liveOnly ? rows.filter((b) => b.isCurrentlyLive) : rows;
  }

  async getById(id: string): Promise<BannerEntity> {
    const banner = await this.banners.findOne({ where: { id } as never });
    if (!banner) throw new NotFoundError('Banner', id);
    return banner;
  }

  async create(input: CreateBannerRequest): Promise<BannerEntity> {
    const storeId = input.storeId ? await this.mustResolveStore(input.storeId) : await this.mustDefaultStore();

    return this.banners.insert({
      storeId,
      placement: input.placement,
      title: input.title ?? null,
      subtitle: input.subtitle ?? null,
      imageUrl: input.imageUrl ?? null,
      mobileImageUrl: input.mobileImageUrl ?? null,
      altText: input.altText ?? null,
      linkUrl: input.linkUrl ?? null,
      ctaLabel: input.ctaLabel ?? null,
      sortOrder: input.sortOrder,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      isActive: input.isActive,
    });
  }

  async update(id: string, input: UpdateBannerRequest): Promise<BannerEntity> {
    const banner = await this.getById(id);

    Object.assign(banner, {
      placement: input.placement ?? banner.placement,
      title: input.title ?? banner.title,
      subtitle: input.subtitle ?? banner.subtitle,
      imageUrl: input.imageUrl ?? banner.imageUrl,
      mobileImageUrl: input.mobileImageUrl ?? banner.mobileImageUrl,
      altText: input.altText ?? banner.altText,
      linkUrl: input.linkUrl ?? banner.linkUrl,
      ctaLabel: input.ctaLabel ?? banner.ctaLabel,
      sortOrder: input.sortOrder ?? banner.sortOrder,
      startsAt: input.startsAt ? new Date(input.startsAt) : banner.startsAt,
      endsAt: input.endsAt ? new Date(input.endsAt) : banner.endsAt,
      isActive: input.isActive ?? banner.isActive,
    });

    await this.banners.save(banner);
    return banner;
  }

  async remove(id: string): Promise<void> {
    await this.banners.hardDelete({ id } as never);
  }

  async reorder(placement: BannerEntity['placement'], orderedIds: string[]): Promise<void> {
    for (const [index, id] of orderedIds.entries()) {
      const banner = await this.getById(id);
      if (banner.placement !== placement) continue;
      banner.sortOrder = index;
      await this.banners.save(banner);
    }
  }

  async recordClick(id: string): Promise<void> {
    await this.banners.incrementClicks(id);
  }

  private async mustResolveStore(storePublicId: string): Promise<string> {
    const storeId = await this.banners.resolveStoreId(storePublicId);
    if (!storeId) throw new ConflictError(`Store '${storePublicId}' not found`);
    return storeId;
  }

  private async mustDefaultStore(): Promise<string> {
    const storeId = await this.banners.defaultStoreId();
    if (!storeId) throw new ConflictError('This tenant has no store to attach the banner to');
    return storeId;
  }

  async toResponse(banner: BannerEntity): Promise<BannerResponse> {
    const storeId = await this.banners.storePublicId(banner.storeId);
    return {
      id: banner.id,
      storeId: storeId ?? banner.storeId,
      placement: banner.placement,
      title: banner.title,
      subtitle: banner.subtitle,
      imageUrl: banner.imageUrl,
      mobileImageUrl: banner.mobileImageUrl,
      altText: banner.altText,
      linkUrl: banner.linkUrl,
      ctaLabel: banner.ctaLabel,
      sortOrder: banner.sortOrder,
      startsAt: banner.startsAt?.toISOString() ?? null,
      endsAt: banner.endsAt?.toISOString() ?? null,
      isActive: banner.isActive,
      isCurrentlyLive: banner.isCurrentlyLive,
      clickCount: banner.clickCount,
      createdAt: banner.createdAt.toISOString(),
    };
  }
}
