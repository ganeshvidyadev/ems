import { Global, Module } from '@nestjs/common';
import { ChannelListingRepository } from './channel-listing.repository';
import { ChannelRepository } from './channel.repository';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { ChannelTokenService } from './channel-token.service';
import { InventorySyncService } from './inventory-sync.service';
import { ListingPublishService } from './listing-publish.service';
import { OrderImportService } from './order-import.service';

/**
 * Global — `ChannelSyncProcessor` (registered in `QueueModule`) injects
 * `ChannelRepository`/`InventorySyncService`/`OrderImportService`/
 * `ChannelTokenService` with no import edge back, the same pattern
 * `DomainModule`/`MarketplaceModule` already establish for their own processors.
 */
@Global()
@Module({
  controllers: [ChannelController],
  providers: [
    ChannelRepository,
    ChannelListingRepository,
    ChannelService,
    ListingPublishService,
    InventorySyncService,
    OrderImportService,
    ChannelTokenService,
  ],
  exports: [
    ChannelRepository,
    ChannelListingRepository,
    ChannelService,
    ListingPublishService,
    InventorySyncService,
    OrderImportService,
    ChannelTokenService,
  ],
})
export class ChannelModule {}
