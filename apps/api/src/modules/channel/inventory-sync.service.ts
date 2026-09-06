import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ChannelAdapterFactory } from '../../integrations/channel/channel-adapter.factory';
import { ChannelListingRepository } from './channel-listing.repository';
import { ChannelRepository } from './channel.repository';
import { ChannelService } from './channel.service';
import { fetchAvailableStock } from './product-stock.util';

export interface InventoryDrift {
  listingId: string;
  productId: string;
  /** What the channel told us it believed the stock was, as of its last confirmation. */
  channelBelieved: number;
  /** What we are about to push — our own current buffered stock. */
  actual: number;
}

export interface SyncResult {
  synced: number;
  failed: number;
  drift: InventoryDrift[];
}

/**
 * Pushes current stock (minus the channel's own oversell buffer) to every
 * live listing on one channel, and reports drift — a mismatch between what
 * the channel last confirmed and what we are about to tell it — *before*
 * overwriting it, so a report exists even though the push itself always
 * "corrects" the channel back to our own number afterward.
 *
 * Must run with the ambient tenant context already set to the channel's own
 * tenant (the queue processor establishes this via `runAsTenant` before
 * calling in) — every read/write here goes through the normal tenant-scoped
 * repositories, exactly as if a console request had made the call.
 */
@Injectable()
export class InventorySyncService {
  private readonly logger = new Logger(InventorySyncService.name);

  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly channels: ChannelRepository,
    private readonly listings: ChannelListingRepository,
    private readonly channelService: ChannelService,
    private readonly adapters: ChannelAdapterFactory,
  ) {}

  async syncChannel(channelId: string): Promise<SyncResult> {
    const channel = await this.channels.findOneOrFail({ where: { id: channelId } });
    const result: SyncResult = { synced: 0, failed: 0, drift: [] };

    if (!channel.isConnected) return result;

    const adapter = this.adapters.resolve(channel.type);
    const credentials = this.channelService.decryptCredentials(channel);
    const liveListings = await this.listings.listLiveForChannel(channelId);

    for (const listing of liveListings) {
      if (!listing.externalListingId) continue;

      try {
        const actual = await fetchAvailableStock(this.manager, listing.productId, listing.variantId);
        const buffered = Math.max(0, actual - channel.inventoryBuffer);

        if (listing.syncedQuantity !== null && listing.syncedQuantity !== buffered) {
          result.drift.push({
            listingId: listing.id,
            productId: listing.productId,
            channelBelieved: listing.syncedQuantity,
            actual: buffered,
          });
        }

        const pushed = await adapter.updateInventory(credentials, listing.externalListingId, buffered);
        listing.syncedQuantity = pushed.confirmedQuantity;
        listing.lastInventorySyncAt = new Date();
        listing.errorCode = null;
        listing.errorMessage = null;
        await this.listings.saveOne(listing);
        result.synced += 1;
      } catch (error) {
        listing.errorCode = 'SYNC_FAILED';
        listing.errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
        await this.listings.saveOne(listing);
        result.failed += 1;
        this.logger.warn(`Inventory sync failed for listing ${listing.id} on channel ${channelId}: ${listing.errorMessage}`);
      }
    }

    channel.lastSyncAt = new Date();
    if (result.failed > 0 && result.synced === 0) {
      channel.lastError = `Inventory sync failed for all ${result.failed} listing(s)`;
    }
    await this.channels.saveOne(channel);

    if (result.drift.length > 0) {
      this.logger.warn(
        `Inventory drift detected on channel ${channelId} for ${result.drift.length} listing(s): ` +
          result.drift.map((d) => `#${d.listingId} channel=${d.channelBelieved} actual=${d.actual}`).join('; '),
      );
    }

    return result;
  }
}
