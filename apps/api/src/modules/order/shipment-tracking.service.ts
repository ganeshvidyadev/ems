import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError } from '@ems/kernel';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';
import { OutboxService } from '../../common/services/outbox.service';
import type { ShipmentEntity } from '../../database/entities';
import { ShippingCarrierFactory } from '../../integrations/shipping/shipping-carrier.factory';
import type { TrackingResult } from '../../integrations/shipping/shipping-carrier.port';
import { InventoryService } from '../inventory/inventory.service';
import { OrderItemRepository, OrderRepository } from './order.repository';
import {
  ShipmentEventRepository,
  ShipmentItemRepository,
  ShipmentRepository,
} from './shipment.repository';

/**
 * Tracking sync: ingests carrier scans (webhook or poll), deduped by
 * `event_hash` — carriers replay the same scan repeatedly on both paths, and
 * `uq_shipment_events_dedupe` is what makes a duplicate delivery a verified
 * no-op rather than double-applying an RTO restock.
 *
 * Neither path trusts the carrier's payload for status: a webhook only tells
 * us *which* shipment to re-check, and `carrier.track()` is what's actually
 * applied — the same "the gateway's API decides, never the caller's claim"
 * rule the payment adapters already follow.
 */
@Injectable()
export class ShipmentTrackingService {
  private readonly logger = new Logger(ShipmentTrackingService.name);

  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly shipments: ShipmentRepository,
    private readonly shipmentItems: ShipmentItemRepository,
    private readonly shipmentEvents: ShipmentEventRepository,
    private readonly orders: OrderRepository,
    private readonly orderItems: OrderItemRepository,
    private readonly inventory: InventoryService,
    private readonly shippingCarriers: ShippingCarrierFactory,
    private readonly context: RequestContextService,
    private readonly outbox: OutboxService,
  ) {}

  /** Webhook path: re-fetches authoritative tracking for the AWB the webhook named. */
  async syncFromWebhook(awbNumber: string): Promise<void> {
    const shipment = await this.shipments.findByAwb(awbNumber);
    if (!shipment) {
      this.logger.warn(`Tracking webhook for unknown AWB ${awbNumber}`);
      return;
    }
    await this.syncOne(shipment);
  }

  /** Forces a sync for one specific shipment, regardless of the polling sweep's ordering. */
  async syncSingle(shipmentPublicId: string): Promise<ShipmentEntity> {
    const shipment = await this.shipments.findByPublicIdOrFail(shipmentPublicId);
    await this.syncOne(shipment);
    return this.shipments.findByPublicIdOrFail(shipmentPublicId);
  }

  /** Polling path: every shipment still in flight for the current tenant. */
  async syncActive(limit = 100): Promise<number> {
    const active = await this.shipments.findActive(limit);
    let synced = 0;
    for (const shipment of active) {
      try {
        await this.syncOne(shipment);
        synced += 1;
      } catch (error) {
        this.logger.warn(
          `Tracking sync failed for shipment ${shipment.shipmentNumber}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }
    return synced;
  }

  private async syncOne(shipment: ShipmentEntity): Promise<void> {
    if (!shipment.awbNumber) return;

    const carrier = this.shippingCarriers.resolve(shipment.carrier.toLowerCase() as never);
    const tracking = await carrier.track(shipment.awbNumber);
    await this.applyTracking(shipment, tracking);
  }

  private async applyTracking(shipment: ShipmentEntity, tracking: TrackingResult): Promise<void> {
    await this.manager.transaction(async (tx) => {
      const shipmentsRepo = this.shipments.withManager(tx);

      let newTerminalStatus: 'DELIVERED' | 'RTO_DELIVERED' | null = null;

      for (const event of tracking.events) {
        // `INSERT IGNORE` against `uq_shipment_events_dedupe` — the same
        // slot a replayed scan lands on is silently skipped, not re-applied.
        const inserted = await this.insertEventIgnoringDuplicates(tx, shipment.id, event);
        if (inserted && (event.status === 'DELIVERED' || event.status === 'RTO_DELIVERED')) {
          newTerminalStatus = event.status;
        }
      }

      const fresh = await shipmentsRepo.findOneOrFail({ where: { id: shipment.id } });
      if (fresh.status === tracking.currentStatus && !newTerminalStatus) return;

      fresh.status = tracking.currentStatus;
      fresh.lastSyncAt = new Date();
      if (tracking.currentStatus === 'DELIVERED') fresh.deliveredAt = fresh.deliveredAt ?? new Date();
      if (tracking.currentStatus === 'RTO_INITIATED') fresh.rtoInitiatedAt = fresh.rtoInitiatedAt ?? new Date();
      await shipmentsRepo.save(fresh);

      if (newTerminalStatus === 'DELIVERED') {
        await this.markOrderDelivered(tx, fresh);
        // Gated on `newTerminalStatus`, which is only set when the DELIVERED
        // scan was newly inserted (not a replayed duplicate) — one emit per
        // shipment's actual delivery, never per webhook retry.
        await this.outbox.emit(tx, {
          aggregateType: 'SHIPMENT',
          aggregateId: fresh.id,
          eventType: 'shipment.delivered',
          payload: { orderId: fresh.orderId, shipmentId: fresh.id, shipmentNumber: fresh.shipmentNumber },
        });
      } else if (newTerminalStatus === 'RTO_DELIVERED') {
        await this.applyRtoRestock(tx, fresh);
      }
    });
  }

  private async insertEventIgnoringDuplicates(
    tx: EntityManager,
    shipmentId: string,
    event: TrackingResult['events'][number],
  ): Promise<boolean> {
    const tenantId = this.context.requireTenantId('shipment tracking ingest');
    const result = (await tx.query(
      `INSERT IGNORE INTO shipment_events
         (tenant_id, shipment_id, status, carrier_status_code, description, location, event_at, event_hash, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        shipmentId,
        event.status,
        event.carrierStatusCode ?? null,
        event.description,
        event.location ?? null,
        event.eventAt,
        event.eventHash,
        JSON.stringify({}),
      ],
    )) as { affectedRows: number };
    return result.affectedRows > 0;
  }

  private async markOrderDelivered(tx: EntityManager, shipment: ShipmentEntity): Promise<void> {
    const ordersRepo = this.orders.withManager(tx);
    const order = await ordersRepo.findOneOrFail({ where: { id: shipment.orderId } });
    if (order.status === 'DELIVERED' || order.status === 'COMPLETED') return;

    order.status = 'DELIVERED';
    order.deliveredAt = order.deliveredAt ?? new Date();
    await ordersRepo.save(order);
  }

  /**
   * A parcel that never reached the customer restocks like a cancellation
   * that happened after the sale was committed: on-hand goes back up, the
   * fulfilment status reverts, and the order itself moves to `RETURNED` —
   * money is untouched here (a COD RTO never collected payment; a prepaid
   * RTO still needs an explicit refund decision, the same reasoning
   * `OrderService.cancel` documents for withholding refunds from cancel).
   */
  private async applyRtoRestock(tx: EntityManager, shipment: ShipmentEntity): Promise<void> {
    const orderItemsRepo = this.orderItems.withManager(tx);
    const shipmentItemsRepo = this.shipmentItems.withManager(tx);
    const ordersRepo = this.orders.withManager(tx);

    const lines = await shipmentItemsRepo.findByShipment(shipment.id);

    for (const line of lines) {
      const orderItem = await orderItemsRepo.findOneOrFail({ where: { id: line.orderItemId } as never });
      if (!orderItem.productId || !orderItem.warehouseId) continue;

      await this.inventory.restock(tx, {
        warehouseId: orderItem.warehouseId,
        productId: orderItem.productId,
        variantId: orderItem.variantId,
        quantity: line.quantity,
        type: 'RETURN',
        referenceType: 'RTO',
        referenceId: shipment.id,
      });

      orderItem.quantityFulfilled = Math.max(orderItem.quantityFulfilled - line.quantity, 0);
      await orderItemsRepo.save(orderItem);
    }

    const order = await ordersRepo.findOneOrFail({ where: { id: shipment.orderId } });
    order.status = 'RETURNED';
    order.fulfilmentStatus = 'RETURNED';
    await ordersRepo.save(order);
  }

  async getEvents(shipmentPublicId: string) {
    const shipment = await this.shipments.findByPublicIdOrFail(shipmentPublicId);
    return this.shipmentEvents.findByShipment(shipment.id);
  }

  async initiateRto(shipmentPublicId: string, reason: string): Promise<ShipmentEntity> {
    const shipment = await this.shipments.findByPublicIdOrFail(shipmentPublicId);
    if (!shipment.awbNumber) throw new NotFoundError('AWB for this shipment');

    const carrier = this.shippingCarriers.resolve(shipment.carrier.toLowerCase() as never);
    await carrier.initiateRto(shipment.awbNumber, reason);

    shipment.status = 'RTO_INITIATED';
    shipment.rtoInitiatedAt = shipment.rtoInitiatedAt ?? new Date();
    await this.shipments.save(shipment);
    return shipment;
  }
}
