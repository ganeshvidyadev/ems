import { Injectable } from '@nestjs/common';
import type { FulfilOrderRequest, OrderResponse } from '@ems/contracts';
import { BusinessRuleError, Money, type CurrencyCode } from '@ems/kernel';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';
import { OrderAlreadyFulfilledError, OrderNotCancellableError } from '../../common/errors/api.errors';
import type { OrderEntity, OrderItemEntity } from '../../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import { CouponService } from '../coupon/coupon.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';
import { OrderItemRepository, OrderRepository, OrderStatusHistoryRepository, type OrderListFilter } from './order.repository';
import { ShipmentItemRepository, ShipmentRepository } from './shipment.repository';

@Injectable()
export class OrderService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly orders: OrderRepository,
    private readonly orderItems: OrderItemRepository,
    private readonly statusHistory: OrderStatusHistoryRepository,
    private readonly shipments: ShipmentRepository,
    private readonly shipmentItems: ShipmentItemRepository,
    private readonly inventory: InventoryService,
    private readonly coupons: CouponService,
    private readonly loyalty: LoyaltyService,
    private readonly context: RequestContextService,
  ) {}

  async list(query: {
    page: number;
    limit: number;
    filter: OrderListFilter;
    sort: { field: string; direction: 'ASC' | 'DESC' }[];
  }): Promise<PaginatedResult<OrderEntity>> {
    const { items, total } = await this.orders.listFiltered(
      query.filter,
      query.sort,
      (query.page - 1) * query.limit,
      query.limit,
    );
    return { items, total };
  }

  async getByPublicId(publicId: string): Promise<OrderEntity> {
    return this.orders.findByPublicIdOrFail(publicId);
  }

  async getItems(orderId: string): Promise<OrderItemEntity[]> {
    return this.orderItems.findByOrder(orderId);
  }

  async getTimeline(orderId: string) {
    return this.statusHistory.findByOrder(orderId);
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Cancels an order, restocking or releasing inventory depending on whether
   * the reservation had already been committed to a sale.
   *
   * `order.status !== 'PENDING'` is the commit signal: `CheckoutService`
   * always moves an order to `CONFIRMED` in the same step that commits its
   * inventory allocation (on payment capture for online gateways, immediately
   * for COD) — so anything past `PENDING` has committed stock to give back,
   * and `PENDING` itself only ever has an open *reservation* to release.
   */
  async cancel(publicId: string, reason?: string): Promise<OrderEntity> {
    return this.manager.transaction(async (tx) => {
      const orders = this.orders.withManager(tx);
      const items = this.orderItems.withManager(tx);
      const history = this.statusHistory.withManager(tx);

      const order = await orders.findByPublicIdOrFail(publicId);
      if (!order.isCancellable) {
        throw new OrderNotCancellableError(order.status);
      }

      const wasCommitted = order.status !== 'PENDING';
      const lineItems = await items.findByOrder(order.id);

      for (const item of lineItems) {
        const openQty = item.quantityOpen;
        if (openQty <= 0 || !item.productId || !item.warehouseId) continue;

        if (wasCommitted) {
          await this.inventory.restock(tx, {
            warehouseId: item.warehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: openQty,
            type: 'ADJUSTMENT',
            referenceType: 'ORDER_CANCEL',
            referenceId: order.id,
          });
        } else {
          await this.inventory.releaseByProduct(tx, {
            warehouseId: item.warehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: openQty,
            referenceType: 'ORDER',
            referenceId: order.id,
          });
        }
        item.quantityCancelled += openQty;
        await items.save(item);
      }

      if (order.couponId) {
        await this.coupons.releaseRedemption(tx, order.couponId, order.id);
      }
      if (order.customerId) {
        await this.loyalty.reverse(tx, order.customerId, order.id);
      }

      const fromStatus = order.status;
      Object.assign(order, {
        status: 'CANCELLED',
        cancelReason: reason ?? null,
        cancelledAt: new Date(),
      });
      await orders.save(order);

      await history.record({
        orderId: order.id,
        statusType: 'ORDER',
        fromStatus,
        toStatus: 'CANCELLED',
        reason: reason ?? null,
        actorType: this.context.userId ? 'USER' : 'SYSTEM',
        actorId: this.context.userId,
        correlationId: this.context.correlationId ?? null,
      });

      return order;
    });
  }

  async hold(publicId: string, reason?: string): Promise<OrderEntity> {
    return this.manager.transaction(async (tx) => {
      const orders = this.orders.withManager(tx);
      const history = this.statusHistory.withManager(tx);

      const order = await orders.findByPublicIdOrFail(publicId);
      if (order.status !== 'CONFIRMED' && order.status !== 'PROCESSING') {
        throw new BusinessRuleError(`Order cannot be put on hold from status '${order.status}'`);
      }

      const fromStatus = order.status;
      order.status = 'ON_HOLD';
      await orders.save(order);

      await history.record({
        orderId: order.id,
        statusType: 'ORDER',
        fromStatus,
        toStatus: 'ON_HOLD',
        reason: reason ?? null,
        actorType: 'USER',
        actorId: this.context.userId,
        correlationId: this.context.correlationId ?? null,
      });

      return order;
    });
  }

  /** Restores the status captured as `fromStatus` on the entry that put the order on hold. */
  async resume(publicId: string): Promise<OrderEntity> {
    return this.manager.transaction(async (tx) => {
      const orders = this.orders.withManager(tx);
      const history = this.statusHistory.withManager(tx);

      const order = await orders.findByPublicIdOrFail(publicId);
      if (order.status !== 'ON_HOLD') {
        throw new BusinessRuleError('Order is not on hold');
      }

      const timeline = await history.findByOrder(order.id);
      const holdEntry = [...timeline].reverse().find((entry) => entry.toStatus === 'ON_HOLD');
      const resumeStatus = (holdEntry?.fromStatus as OrderEntity['status'] | undefined) ?? 'CONFIRMED';

      order.status = resumeStatus;
      await orders.save(order);

      await history.record({
        orderId: order.id,
        statusType: 'ORDER',
        fromStatus: 'ON_HOLD',
        toStatus: resumeStatus,
        actorType: 'USER',
        actorId: this.context.userId,
        correlationId: this.context.correlationId ?? null,
      });

      return order;
    });
  }

  /** Partial or full fulfilment: ships some/all open quantity of the requested lines. */
  async fulfil(publicId: string, input: FulfilOrderRequest): Promise<OrderEntity> {
    return this.manager.transaction(async (tx) => {
      const orders = this.orders.withManager(tx);
      const items = this.orderItems.withManager(tx);
      const history = this.statusHistory.withManager(tx);
      const shipmentsRepo = this.shipments.withManager(tx);
      const shipmentItemsRepo = this.shipmentItems.withManager(tx);

      const order = await orders.findByPublicIdOrFail(publicId);
      if (order.fulfilmentStatus === 'FULFILLED') {
        throw new OrderAlreadyFulfilledError('This order has already been fully fulfilled');
      }

      const shipment = await shipmentsRepo.insert({
        orderId: order.id,
        warehouseId: null,
        shipmentNumber: shipmentsRepo.generateShipmentNumber(),
        carrier: (input.carrier?.toUpperCase() as never) ?? 'SELF',
        awbNumber: input.awbNumber ?? null,
        status: input.awbNumber ? 'LABEL_CREATED' : 'PENDING',
      });

      for (const requested of input.items) {
        const line = await items.findOneOrFail({ where: { id: requested.orderItemId } as never });
        if (requested.quantity > line.quantityOpen) {
          throw new BusinessRuleError(
            `Cannot fulfil ${requested.quantity} of order item ${requested.orderItemId}; only ${line.quantityOpen} are open`,
          );
        }

        line.quantityFulfilled += requested.quantity;
        await items.save(line);

        await shipmentItemsRepo.insert({
          shipmentId: shipment.id,
          orderItemId: line.id,
          quantity: requested.quantity,
        });
      }

      const allItems = await items.findByOrder(order.id);
      const allFulfilled = allItems.every((i) => i.quantityOpen === 0);
      const anyFulfilled = allItems.some((i) => i.quantityFulfilled > 0);

      const fromFulfilment = order.fulfilmentStatus;
      order.fulfilmentStatus = allFulfilled ? 'FULFILLED' : anyFulfilled ? 'PARTIALLY_FULFILLED' : order.fulfilmentStatus;
      if (allFulfilled && (order.status === 'CONFIRMED' || order.status === 'PROCESSING')) {
        order.status = 'SHIPPED';
      }
      await orders.save(order);

      await history.record({
        orderId: order.id,
        statusType: 'FULFILMENT',
        fromStatus: fromFulfilment,
        toStatus: order.fulfilmentStatus,
        actorType: 'USER',
        actorId: this.context.userId,
        correlationId: this.context.correlationId ?? null,
      });

      return order;
    });
  }

  async close(publicId: string): Promise<OrderEntity> {
    return this.manager.transaction(async (tx) => {
      const orders = this.orders.withManager(tx);
      const history = this.statusHistory.withManager(tx);

      const order = await orders.findByPublicIdOrFail(publicId);
      if (order.fulfilmentStatus !== 'FULFILLED') {
        throw new BusinessRuleError('An order can only be closed once fully fulfilled');
      }

      const fromStatus = order.status;
      order.status = 'COMPLETED';
      order.closedAt = new Date();
      await orders.save(order);

      await history.record({
        orderId: order.id,
        statusType: 'ORDER',
        fromStatus,
        toStatus: 'COMPLETED',
        actorType: 'USER',
        actorId: this.context.userId,
        correlationId: this.context.correlationId ?? null,
      });

      return order;
    });
  }

  // =========================================================================
  // Mapping
  // =========================================================================

  async toResponse(order: OrderEntity, includeTimeline = false): Promise<OrderResponse> {
    const currency = order.currency as CurrencyCode;
    const items = await this.getItems(order.id);
    const timeline = includeTimeline ? await this.getTimeline(order.id) : undefined;

    return {
      id: order.publicId,
      orderNumber: order.orderNumber,
      storeId: order.storeId,
      customerId: order.customerId,
      email: order.email,
      phone: order.phoneE164,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfilmentStatus: order.fulfilmentStatus,
      currency: order.currency,
      subtotal: Money.fromMinor(order.subtotalMinor, currency).toJSON(),
      discount: Money.fromMinor(order.discountMinor, currency).toJSON(),
      shipping: Money.fromMinor(order.shippingMinor, currency).toJSON(),
      tax: Money.fromMinor(order.taxMinor, currency).toJSON(),
      codFee: Money.fromMinor(order.codFeeMinor, currency).toJSON(),
      total: Money.fromMinor(order.totalMinor, currency).toJSON(),
      amountPaid: Money.fromMinor(order.amountPaidMinor, currency).toJSON(),
      amountRefunded: Money.fromMinor(order.amountRefundedMinor, currency).toJSON(),
      shippingAddress: order.shippingAddress as never,
      billingAddress: order.billingAddress as never,
      channel: order.channel,
      couponCode: order.couponCode,
      customerNote: order.customerNote,
      cancelReason: order.cancelReason,
      items: items.map((item) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        name: item.name,
        variantTitle: item.variantTitle,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPrice: Money.fromMinor(item.unitPriceMinor, currency).toJSON(),
        lineSubtotal: Money.fromMinor(item.lineSubtotalMinor, currency).toJSON(),
        lineDiscount: Money.fromMinor(item.lineDiscountMinor, currency).toJSON(),
        lineTax: Money.fromMinor(item.lineTaxMinor, currency).toJSON(),
        lineTotal: Money.fromMinor(item.lineTotalMinor, currency).toJSON(),
        quantityFulfilled: item.quantityFulfilled,
        quantityReturned: item.quantityReturned,
        quantityCancelled: item.quantityCancelled,
      })),
      timeline: timeline?.map((t) => ({
        statusType: t.statusType,
        fromStatus: t.fromStatus,
        toStatus: t.toStatus,
        reason: t.reason,
        actorType: t.actorType,
        createdAt: t.createdAt.toISOString(),
      })),
      placedAt: order.placedAt?.toISOString() ?? null,
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}

