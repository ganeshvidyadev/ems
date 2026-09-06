import { Injectable, Logger } from '@nestjs/common';
import { ValidationError } from '@ems/kernel';
import { randomBytes } from 'node:crypto';
import type {
  ChannelAdapterPort,
  ChannelOrderStatusPush,
  ChannelTokenSet,
  ImportedChannelOrder,
  InventoryUpdateResult,
  OrderImportPage,
  PublishListingInput,
  PublishListingResult,
} from '../channel-adapter.port';

interface StubListing {
  externalListingId: string;
  quantity: number;
  status: 'LIVE' | 'REJECTED';
}

/**
 * In-memory channel for local development and tests — the channel-side twin
 * of `StubShippingAdapter`/`StubPaymentAdapter`. A genuine implementation of
 * the port: it actually tracks published listings and their quantities, and
 * generates a real, ordered stream of importable orders, so the connect →
 * publish → sync → import lifecycle is exercisable end-to-end with no live
 * marketplace account.
 */
@Injectable()
export class StubChannelAdapter implements ChannelAdapterPort {
  readonly type = 'STUB' as const;
  private readonly logger = new Logger(StubChannelAdapter.name);
  private readonly listings = new Map<string, StubListing>();
  private readonly pendingOrders: ImportedChannelOrder[] = [];

  isConfigured(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  buildAuthorizeUrl(redirectUri: string, state: string): string {
    this.assertNotProduction();
    return `${redirectUri}?code=stub-code&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(): Promise<ChannelTokenSet> {
    this.assertNotProduction();
    return {
      accessToken: `stub_access_${randomBytes(8).toString('hex')}`,
      refreshToken: `stub_refresh_${randomBytes(8).toString('hex')}`,
      expiresAt: new Date(Date.now() + 3_600_000),
      externalAccountId: `stub-seller-${randomBytes(4).toString('hex')}`,
    };
  }

  async refreshToken(refreshToken: string): Promise<ChannelTokenSet> {
    this.assertNotProduction();
    return {
      accessToken: `stub_access_${randomBytes(8).toString('hex')}`,
      refreshToken,
      expiresAt: new Date(Date.now() + 3_600_000),
    };
  }

  async publishListing(_credentials: ChannelTokenSet, input: PublishListingInput): Promise<PublishListingResult> {
    this.assertNotProduction();
    if (!input.categoryId) {
      return { externalListingId: input.externalSku, status: 'REJECTED', errorMessage: 'No category mapping configured' };
    }
    const externalListingId = `stub_listing_${input.externalSku}`;
    this.listings.set(externalListingId, { externalListingId, quantity: input.quantity, status: 'LIVE' });
    return { externalListingId, status: 'LIVE' };
  }

  async updateInventory(_credentials: ChannelTokenSet, externalListingId: string, quantity: number): Promise<InventoryUpdateResult> {
    this.assertNotProduction();
    const listing = this.mustFind(externalListingId);
    listing.quantity = quantity;
    return { confirmedQuantity: quantity };
  }

  async importOrdersSince(_credentials: ChannelTokenSet, cursor: string | null): Promise<OrderImportPage> {
    this.assertNotProduction();
    const startIndex = cursor ? Number(cursor) : 0;
    const page = this.pendingOrders.slice(startIndex, startIndex + 25);
    const nextIndex = startIndex + page.length;
    return { orders: page, nextCursor: nextIndex < this.pendingOrders.length ? String(nextIndex) : null };
  }

  async pushOrderStatus(
    _credentials: ChannelTokenSet,
    externalOrderId: string,
    status: ChannelOrderStatusPush,
  ): Promise<void> {
    this.assertNotProduction();
    this.logger.debug(`Stub channel: order ${externalOrderId} → ${status}`);
  }

  /** Dev/test helper — queues a fake order the next `importOrdersSince` call will pick up. */
  enqueueOrder(order: ImportedChannelOrder): void {
    this.assertNotProduction();
    this.pendingOrders.push(order);
  }

  private mustFind(externalListingId: string): StubListing {
    const listing = this.listings.get(externalListingId);
    if (!listing) throw new ValidationError(`Unknown stub channel listing: ${externalListingId}`);
    return listing;
  }

  private assertNotProduction(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'StubChannelAdapter was invoked in production. This would report fake listings/orders ' +
          'as real without any marketplace ever seeing them — check the channel type.',
      );
    }
  }
}
