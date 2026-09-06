import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ShipmentEntity, ShipmentEventEntity, ShipmentItemEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class ShipmentRepository extends TenantScopedRepository<ShipmentEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ShipmentEntity, context);
  }

  async findByOrder(orderId: string): Promise<ShipmentEntity[]> {
    return this.find({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  async findByAwb(awbNumber: string): Promise<ShipmentEntity | null> {
    return this.findOne({ where: { awbNumber } });
  }

  /** Shipments still in flight — the polling sweep's candidate set. */
  async findActive(limit: number): Promise<ShipmentEntity[]> {
    return this.repository
      .createQueryBuilder('shipment')
      .where('shipment.tenantId = :tenantId', { tenantId: this.tenantId })
      .andWhere('shipment.awbNumber IS NOT NULL')
      .andWhere('shipment.status NOT IN (:...terminal)', {
        terminal: ['DELIVERED', 'RTO_DELIVERED', 'CANCELLED', 'LOST'],
      })
      .orderBy('shipment.lastSyncAt', 'ASC')
      .take(limit)
      .getMany();
  }

  /** `shipment_number` has no gapless requirement (unlike `order_number`), so a
   * timestamp-based value is enough to keep it unique and merchant-legible. */
  generateShipmentNumber(): string {
    return `SHP-${Date.now().toString(36).toUpperCase()}`;
  }
}

@Injectable()
export class ShipmentItemRepository extends TenantScopedRepository<ShipmentItemEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ShipmentItemEntity, context);
  }

  async findByShipment(shipmentId: string): Promise<ShipmentItemEntity[]> {
    return this.find({ where: { shipmentId } });
  }
}

@Injectable()
export class ShipmentEventRepository extends TenantScopedRepository<ShipmentEventEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ShipmentEventEntity, context);
  }

  async findByShipment(shipmentId: string): Promise<ShipmentEventEntity[]> {
    return this.find({ where: { shipmentId }, order: { eventAt: 'ASC' } });
  }
}
