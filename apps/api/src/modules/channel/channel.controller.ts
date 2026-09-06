import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  configureChannelRequestSchema,
  connectChannelRequestSchema,
  publishListingRequestSchema,
  type ChannelListingResponse,
  type ChannelResponse,
} from '@ems/contracts';
import { Permissions, Public, Validate } from '../../common/decorators';
import type { ChannelEntity, ChannelListingEntity } from '../../database/entities';
import { ChannelListingRepository } from './channel-listing.repository';
import { ChannelService } from './channel.service';
import { ChannelTokenService } from './channel-token.service';
import { InventorySyncService } from './inventory-sync.service';
import { ListingPublishService } from './listing-publish.service';
import { OrderImportService } from './order-import.service';

@ApiTags('channels')
@Controller({ version: '1' })
export class ChannelController {
  constructor(
    private readonly channels: ChannelService,
    private readonly listings: ChannelListingRepository,
    private readonly publisher: ListingPublishService,
    private readonly inventorySync: InventorySyncService,
    private readonly orderImport: OrderImportService,
    private readonly tokenService: ChannelTokenService,
  ) {}

  @Post('console/channels')
  @Permissions('channel:connect')
  @Validate(connectChannelRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Connect a sales channel — returns the OAuth URL to send the merchant to' })
  async connect(@Body() body: ReturnType<typeof connectChannelRequestSchema.parse>) {
    const { channel, authorizeUrl } = await this.channels.startConnect(body.storeId, body.type, body.name);
    return { channelId: channel.id, authorizeUrl };
  }

  /**
   * Public: hit by the marketplace's own redirect after the merchant
   * authorizes, never by an authenticated console request — there is no JWT
   * here. `ChannelService.completeOAuth` recovers the tenant from `state`.
   */
  @Get('console/channels/oauth/callback')
  @Public()
  @ApiOperation({ summary: 'OAuth callback — completes a pending channel connection' })
  async oauthCallback(@Query('code') code: string, @Query('state') state: string) {
    const { channelId } = await this.channels.completeOAuth(code, state);
    return { channelId, status: 'connected' };
  }

  @Get('console/channels')
  @Permissions('channel:read')
  @ApiOperation({ summary: 'List a store\'s connected/pending channels' })
  async list(@Query('storeId') storeId: string): Promise<ChannelResponse[]> {
    const channels = await this.channels.list(storeId);
    return channels.map(toChannelResponse);
  }

  @Get('console/channels/:id')
  @Permissions('channel:read')
  @ApiOperation({ summary: 'Get one channel' })
  async get(@Param('id') id: string): Promise<ChannelResponse> {
    return toChannelResponse(await this.channels.get(id));
  }

  @Put('console/channels/:id')
  @Permissions('channel:configure')
  @Validate(configureChannelRequestSchema)
  @ApiOperation({ summary: 'Update a channel\'s settings, inventory buffer, or auto-publish/import flags' })
  async configure(@Param('id') id: string, @Body() body: ReturnType<typeof configureChannelRequestSchema.parse>): Promise<ChannelResponse> {
    return toChannelResponse(await this.channels.configure(id, body));
  }

  @Post('console/channels/:id/disconnect')
  @Permissions('channel:disconnect')
  @ApiOperation({ summary: 'Disconnect a channel and discard its stored credentials' })
  async disconnect(@Param('id') id: string): Promise<ChannelResponse> {
    return toChannelResponse(await this.channels.disconnect(id));
  }

  @Post('console/channels/:id/refresh-token')
  @Permissions('channel:configure')
  @ApiOperation({ summary: 'Check and, if due, proactively refresh this channel\'s OAuth token now' })
  async refreshToken(@Param('id') id: string) {
    return { outcome: await this.tokenService.checkAndRefresh(id) };
  }

  @Get('console/channels/:id/listings')
  @Permissions('channel:read')
  @ApiOperation({ summary: 'List every product published (or attempted) on this channel' })
  async listListings(@Param('id') id: string): Promise<ChannelListingResponse[]> {
    const rows = await this.listings.listForChannel(id);
    return rows.map(toListingResponse);
  }

  @Post('console/channels/:id/publish')
  @Permissions('channel:configure')
  @Validate(publishListingRequestSchema)
  @ApiOperation({ summary: 'Publish (or republish) one product to this channel' })
  async publish(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof publishListingRequestSchema.parse>,
  ): Promise<ChannelListingResponse> {
    const listing = await this.publisher.publish(id, body.productId, body.variantId ?? null);
    return toListingResponse(listing);
  }

  @Post('console/channels/listings/:listingId/delist')
  @Permissions('channel:configure')
  @ApiOperation({ summary: 'Delist a product from its channel' })
  async delist(@Param('listingId') listingId: string): Promise<ChannelListingResponse> {
    return toListingResponse(await this.publisher.delist(listingId));
  }

  @Post('console/channels/:id/sync-inventory')
  @Permissions('channel:sync')
  @ApiOperation({ summary: 'Push current stock (minus the channel\'s buffer) to every live listing now, and report drift' })
  async syncInventory(@Param('id') id: string) {
    return this.inventorySync.syncChannel(id);
  }

  @Post('console/channels/:id/import-orders')
  @Permissions('channel:sync')
  @ApiOperation({ summary: 'Import the next page of orders from this channel now' })
  async importOrders(@Param('id') id: string) {
    return this.orderImport.importNextPage(id);
  }
}

function toChannelResponse(channel: ChannelEntity): ChannelResponse {
  return {
    id: channel.id,
    storeId: channel.storeId,
    type: channel.type,
    name: channel.name,
    status: channel.status,
    externalAccountId: channel.externalAccountId,
    marketplaceId: channel.marketplaceId,
    inventoryBuffer: channel.inventoryBuffer,
    autoPublish: channel.autoPublish,
    autoImportOrders: channel.autoImportOrders,
    lastSyncAt: channel.lastSyncAt?.toISOString() ?? null,
    lastError: channel.lastError,
    tokenExpiresAt: channel.tokenExpiresAt?.toISOString() ?? null,
    createdAt: channel.createdAt.toISOString(),
  };
}

function toListingResponse(listing: ChannelListingEntity): ChannelListingResponse {
  return {
    id: listing.id,
    channelId: listing.channelId,
    productId: listing.productId,
    variantId: listing.variantId,
    externalListingId: listing.externalListingId,
    externalSku: listing.externalSku,
    status: listing.status,
    channelPriceMinor: listing.channelPriceMinor,
    syncedQuantity: listing.syncedQuantity,
    lastPublishedAt: listing.lastPublishedAt?.toISOString() ?? null,
    lastInventorySyncAt: listing.lastInventorySyncAt?.toISOString() ?? null,
    errorCode: listing.errorCode,
    errorMessage: listing.errorMessage,
  };
}
