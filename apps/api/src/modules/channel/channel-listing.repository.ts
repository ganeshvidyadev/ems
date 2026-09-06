import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { IsNull, type EntityManager } from 'typeorm';
import { ChannelListingEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class ChannelListingRepository extends TenantScopedRepository<ChannelListingEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ChannelListingEntity, context);
  }

  /** Single-entity `save` — the inherited `save(T | T[])` union return type otherwise forces a cast at every call site. */
  async saveOne(entity: ChannelListingEntity): Promise<ChannelListingEntity> {
    return (await this.save(entity)) as ChannelListingEntity;
  }

  async findForChannelAndProduct(channelId: string, productId: string, variantId: string | null): Promise<ChannelListingEntity | null> {
    return this.findOne({ where: { channelId, productId, variantId: variantId ?? IsNull() } });
  }

  async listForChannel(channelId: string): Promise<ChannelListingEntity[]> {
    return this.find({ where: { channelId }, order: { createdAt: 'ASC' } });
  }

  /** Every live listing for a product, across every channel — the inventory-sync fan-out when stock changes. */
  async listLiveForProduct(productId: string): Promise<ChannelListingEntity[]> {
    return this.find({ where: { productId, status: 'LIVE' } });
  }

  /** Every live listing on one channel — one channel's own inventory-sync worklist. */
  async listLiveForChannel(channelId: string): Promise<ChannelListingEntity[]> {
    return this.find({ where: { channelId, status: 'LIVE' } });
  }
}
