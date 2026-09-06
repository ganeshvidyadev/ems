import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Money, type CurrencyCode } from '@ems/kernel';
import type { ChannelType, OrderChannel } from '../../database/entities';
import { OrderItemRepository, OrderRepository, OrderStatusHistoryRepository } from '../order/order.repository';
import { InventoryService } from '../inventory/inventory.service';
import { ChannelAdapterFactory } from '../../integrations/channel/channel-adapter.factory';
import type { ImportedChannelOrder } from '../../integrations/channel/channel-adapter.port';
import { ChannelRepository } from './channel.repository';
import { ChannelListingRepository } from './channel-listing.repository';
import { ChannelService } from './channel.service';

export interface OrderImportResult {
  imported: number;
  skippedExisting: number;
  nextCursor: string | null;
}

/** `orders.channel` collapses Facebook/Instagram to `META` and has no `GOOGLE`/`STUB` value — `API` stands in for both. */
const CHANNEL_TYPE_TO_ORDER_CHANNEL: Record<ChannelType, OrderChannel> = {
  AMAZON: 'AMAZON',
  FLIPKART: 'FLIPKART',
  EBAY: 'EBAY',
  FACEBOOK: 'META',
  INSTAGRAM: 'META',
  WHATSAPP: 'WHATSAPP',
  GOOGLE: 'API',
  STUB: 'API',
};

/**
 * Cursor-based order import. Idempotent via the existing
 * `uq_orders_channel_ref (tenant_id, channel, channel_order_ref)` constraint
 * — every marketplace redelivers, so re-importing the same external order is
 * checked for and skipped explicitly rather than relying on the constraint
 * to reject a duplicate insert (which would also abort the whole batch's
 * transaction on a real unique-key violation).
 *
 * Must run with the ambient tenant context already set to the channel's own
 * tenant, the same requirement `InventorySyncService` documents.
 */
@Injectable()
export class OrderImportService {
  private readonly logger = new Logger(OrderImportService.name);

  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly channels: ChannelRepository,
    private readonly listings: ChannelListingRepository,
    private readonly orders: OrderRepository,
    private readonly orderItems: OrderItemRepository,
    private readonly statusHistory: OrderStatusHistoryRepository,
    private readonly inventory: InventoryService,
    private readonly channelService: ChannelService,
    private readonly adapters: ChannelAdapterFactory,
  ) {}

  /** Imports one page (the adapter's own page size) starting from the channel's stored cursor, then advances it. */
  async importNextPage(channelId: string): Promise<OrderImportResult> {
    const channel = await this.channels.findOneOrFail({ where: { id: channelId } });
    const result: OrderImportResult = { imported: 0, skippedExisting: 0, nextCursor: channel.lastOrderCursor };
    if (!channel.isConnected) return result;

    const adapter = this.adapters.resolve(channel.type);
    const credentials = this.channelService.decryptCredentials(channel);
    const page = await adapter.importOrdersSince(credentials, channel.lastOrderCursor);
    const orderChannel = CHANNEL_TYPE_TO_ORDER_CHANNEL[channel.type];

    for (const imported of page.orders) {
      const created = await this.importOne(channel.storeId, orderChannel, channelId, imported);
      if (created) result.imported += 1;
      else result.skippedExisting += 1;
    }

    channel.lastOrderCursor = page.nextCursor;
    channel.lastSyncAt = new Date();
    await this.channels.saveOne(channel);

    result.nextCursor = page.nextCursor;
    return result;
  }

  private async importOne(
    storeId: string,
    orderChannel: OrderChannel,
    channelId: string,
    imported: ImportedChannelOrder,
  ): Promise<boolean> {
    const existing = await this.orders.findOne({ where: { channel: orderChannel, channelOrderRef: imported.externalOrderId } });
    if (existing) return false;

    await this.manager.transaction(async (tx) => {
      const ordersRepo = this.orders.withManager(tx);
      const orderItemsRepo = this.orderItems.withManager(tx);
      const historyRepo = this.statusHistory.withManager(tx);
      const listingsRepo = this.listings.withManager(tx);

      const currency = imported.currency as CurrencyCode;
      const orderNumber = await ordersRepo.nextOrderNumber(tx);

      const order = await ordersRepo.insert({
        storeId,
        orderNumber,
        customerId: null,
        email: imported.buyerEmail,
        phoneE164: imported.shippingAddress?.phone ?? null,
        status: 'CONFIRMED',
        // Channel checkouts are already paid on the marketplace's own rails by
        // the time an order is importable at all — there is no local gateway
        // session for it.
        paymentStatus: 'PAID',
        fulfilmentStatus: 'UNFULFILLED',
        currency,
        subtotalMinor: imported.totalMinor,
        totalMinor: imported.totalMinor,
        amountPaidMinor: imported.totalMinor,
        shippingAddress: imported.shippingAddress,
        billingAddress: imported.shippingAddress,
        channel: orderChannel,
        channelOrderRef: imported.externalOrderId,
        placedAt: imported.placedAt,
        confirmedAt: new Date(),
      });

      for (const line of imported.lines) {
        const listing = await listingsRepo.findOne({ where: { channelId, externalSku: line.externalSku } });
        const lineTotal = Money.fromMinor(line.unitPriceMinor, currency).multiplyByQuantity(line.quantity);

        await orderItemsRepo.insert({
          orderId: order.id,
          productId: listing?.productId ?? null,
          variantId: listing?.variantId ?? null,
          sku: line.externalSku,
          name: line.title,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          lineSubtotalMinor: lineTotal.amountMinor.toString(),
          lineTotalMinor: lineTotal.amountMinor.toString(),
        });

        if (listing?.productId) {
          await this.decrementStock(tx, storeId, listing.productId, listing.variantId, line.quantity, order.id);
        }
      }

      await historyRepo.record({
        orderId: order.id,
        statusType: 'ORDER',
        fromStatus: null,
        toStatus: 'CONFIRMED',
        actorType: 'WEBHOOK',
        correlationId: null,
      });
    });

    return true;
  }

  /**
   * A direct reserve-then-commit, not a two-phase checkout reservation — the
   * sale already happened on the channel's own rails; our stock is simply
   * out of date until this runs. Best-effort: insufficient local stock is
   * logged and skipped rather than failing the whole import, because the
   * external order is real regardless of what our own count says.
   */
  private async decrementStock(
    tx: EntityManager,
    storeId: string,
    productId: string,
    variantId: string | null,
    quantity: number,
    orderId: string,
  ): Promise<void> {
    try {
      const allocations = await this.inventory.reserveAcrossWarehouses(tx, {
        storeId,
        productId,
        variantId,
        quantity,
        referenceType: 'ORDER',
        referenceId: orderId,
      });
      await this.inventory.commitAllocations(tx, allocations, {
        productId,
        variantId,
        referenceType: 'ORDER',
        referenceId: orderId,
      });
    } catch (error) {
      this.logger.warn(
        `Could not decrement stock for product ${productId} on imported order ${orderId}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
}
