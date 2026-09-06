import { Injectable } from '@nestjs/common';
import type { InspectReturnRequest, RequestReturnRequest, ReturnResponse } from '@ems/contracts';
import { BusinessRuleError, Money, type CurrencyCode } from '@ems/kernel';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';
import type { ReturnEntity, ReturnItemEntity } from '../../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import { OrderItemRepository, OrderRepository } from './order.repository';
import { ReturnItemRepository, ReturnRepository } from './return.repository';

@Injectable()
export class ReturnService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly returns: ReturnRepository,
    private readonly returnItems: ReturnItemRepository,
    private readonly orders: OrderRepository,
    private readonly orderItems: OrderItemRepository,
    private readonly inventory: InventoryService,
    private readonly context: RequestContextService,
  ) {}

  async list(orderId?: string) {
    if (orderId) return this.returns.findByOrder(orderId);
    return (await this.returns.findAndCount({})).items;
  }

  async getByPublicId(publicId: string): Promise<ReturnEntity> {
    return this.returns.findByPublicIdOrFail(publicId);
  }

  async getItems(returnId: string): Promise<ReturnItemEntity[]> {
    return this.returnItems.findByReturn(returnId);
  }

  /** Opens an RMA. Customer-or-merchant initiated; no stock/money movement happens yet. */
  async request(orderPublicId: string, input: RequestReturnRequest): Promise<ReturnEntity> {
    return this.manager.transaction(async (tx) => {
      const orders = this.orders.withManager(tx);
      const orderItemsRepo = this.orderItems.withManager(tx);
      const returnsRepo = this.returns.withManager(tx);
      const returnItemsRepo = this.returnItems.withManager(tx);

      const order = await orders.findByPublicIdOrFail(orderPublicId);

      const rma = await returnsRepo.insert({
        orderId: order.id,
        customerId: order.customerId,
        rmaNumber: returnsRepo.generateRmaNumber(),
        type: input.type,
        status: 'REQUESTED',
        reason: input.reason,
        reasonDetail: input.reasonDetail ?? null,
        customerImages: input.customerImages ?? null,
      });

      for (const line of input.items) {
        const orderItem = await orderItemsRepo.findOneOrFail({ where: { id: line.orderItemId } as never });
        if (orderItem.orderId !== order.id) {
          throw new BusinessRuleError('Order item does not belong to this order');
        }
        const alreadyRequested = orderItem.quantityReturned;
        if (line.quantity + alreadyRequested > orderItem.quantity) {
          throw new BusinessRuleError(`Cannot return more than was ordered for item ${line.orderItemId}`);
        }

        await returnItemsRepo.insert({
          returnId: rma.id,
          orderItemId: orderItem.id,
          quantity: line.quantity,
          restock: line.restock,
        });
      }

      return rma;
    });
  }

  async approve(publicId: string): Promise<ReturnEntity> {
    return this.transitionStatus(publicId, 'REQUESTED', 'APPROVED', (rma) => {
      rma.approvedBy = this.context.userId;
      rma.approvedAt = new Date();
    });
  }

  async reject(publicId: string, reason: string): Promise<ReturnEntity> {
    return this.transitionStatus(publicId, 'REQUESTED', 'REJECTED', (rma) => {
      rma.rejectedReason = reason;
    });
  }

  async markReceived(publicId: string): Promise<ReturnEntity> {
    return this.transitionStatus(publicId, 'APPROVED', 'RECEIVED', (rma) => {
      rma.receivedAt = new Date();
    });
  }

  /**
   * Inspection is where restock actually happens: resellable items go back on
   * the shelf, and the return's refund figures are set for a subsequent
   * explicit refund (never automatic — see `ORDER_MANAGER`'s permission split
   * between fulfilment and money movement).
   */
  async inspect(publicId: string, input: InspectReturnRequest): Promise<ReturnEntity> {
    return this.manager.transaction(async (tx) => {
      const returnsRepo = this.returns.withManager(tx);
      const returnItemsRepo = this.returnItems.withManager(tx);
      const orderItemsRepo = this.orderItems.withManager(tx);

      const rma = await returnsRepo.findByPublicIdOrFail(publicId);
      if (rma.status !== 'RECEIVED') {
        throw new BusinessRuleError(`Return cannot be inspected from status '${rma.status}'`);
      }

      const lines = await returnItemsRepo.findByReturn(rma.id);
      for (const line of lines) {
        const orderItem = await orderItemsRepo.findOneOrFail({ where: { id: line.orderItemId } as never });
        orderItem.quantityReturned += line.quantity;
        await orderItemsRepo.save(orderItem);

        if (input.result === 'RESELLABLE' && line.restock && orderItem.productId && orderItem.warehouseId) {
          await this.inventory.restock(tx, {
            warehouseId: orderItem.warehouseId,
            productId: orderItem.productId,
            variantId: orderItem.variantId,
            quantity: line.quantity,
            type: 'RETURN',
            referenceType: 'RETURN',
            referenceId: rma.id,
          });
        }
      }

      Object.assign(rma, {
        status: 'INSPECTED',
        inspectionResult: input.result,
        inspectedAt: new Date(),
        refundAmountMinor: input.refundAmountMinor ?? rma.refundAmountMinor,
        restockingFeeMinor: input.restockingFeeMinor ?? rma.restockingFeeMinor,
      });
      await returnsRepo.save(rma);
      return rma;
    });
  }

  async complete(publicId: string): Promise<ReturnEntity> {
    return this.transitionStatus(publicId, 'INSPECTED', 'COMPLETED', (rma) => {
      rma.completedAt = new Date();
    });
  }

  private async transitionStatus(
    publicId: string,
    expectedFrom: ReturnEntity['status'],
    to: ReturnEntity['status'],
    mutate: (rma: ReturnEntity) => void,
  ): Promise<ReturnEntity> {
    const rma = await this.returns.findByPublicIdOrFail(publicId);
    if (rma.status !== expectedFrom) {
      throw new BusinessRuleError(`Return cannot move to '${to}' from status '${rma.status}'`);
    }
    mutate(rma);
    rma.status = to;
    await this.returns.save(rma);
    return rma;
  }

  async toResponse(rma: ReturnEntity): Promise<ReturnResponse> {
    const order = await this.orders.findOneOrFail({ where: { id: rma.orderId } as never });
    const currency = order.currency as CurrencyCode;
    const items = await this.getItems(rma.id);

    return {
      id: rma.publicId,
      orderId: order.publicId,
      rmaNumber: rma.rmaNumber,
      type: rma.type,
      status: rma.status,
      reason: rma.reason,
      reasonDetail: rma.reasonDetail,
      refundAmount: rma.refundAmountMinor ? Money.fromMinor(rma.refundAmountMinor, currency).toJSON() : null,
      restockingFee: Money.fromMinor(rma.restockingFeeMinor, currency).toJSON(),
      inspectionResult: rma.inspectionResult,
      items: items.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
        conditionNote: item.conditionNote,
        restock: item.restock,
        refund: item.refundMinor ? Money.fromMinor(item.refundMinor, currency).toJSON() : null,
      })),
      createdAt: rma.createdAt.toISOString(),
      updatedAt: rma.updatedAt.toISOString(),
    };
  }
}
