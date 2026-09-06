import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ShipmentEntity, ShipmentItemEntity } from '../../database/entities';
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
