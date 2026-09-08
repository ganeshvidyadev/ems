import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere } from 'typeorm';
import { OrderEntity, OrderItemEntity, OrderStatusHistoryEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

export interface OrderListFilter {
  storeId?: string;
  customerId?: string;
  status?: string;
  paymentStatus?: string;
  fulfilmentStatus?: string;
}

@Injectable()
export class OrderRepository extends TenantScopedRepository<OrderEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, OrderEntity, context);
  }

  async listFiltered(
    filter: OrderListFilter,
    sort: { field: string; direction: 'ASC' | 'DESC' }[],
    skip: number,
    take: number,
  ) {
    const where: FindOptionsWhere<OrderEntity> = {};
    if (filter.storeId) where.storeId = filter.storeId;
    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.status) where.status = filter.status as OrderEntity['status'];
    if (filter.paymentStatus) where.paymentStatus = filter.paymentStatus as OrderEntity['paymentStatus'];
    if (filter.fulfilmentStatus) {
      where.fulfilmentStatus = filter.fulfilmentStatus as OrderEntity['fulfilmentStatus'];
    }

    return this.findAndCount({
      where,
      order: Object.fromEntries(sort.map((s) => [s.field, s.direction])),
      skip,
      take,
    });
  }

  /**
   * Allocates the next gapless order number for the tenant.
   *
   * Row-locked counter, not `AUTO_INCREMENT` — see `order_sequences`'
   * migration comment. Must run inside the same transaction as the order
   * insert it numbers.
   */
  async nextOrderNumber(manager: EntityManager): Promise<string> {
    const tenantId = this.tenantId;

    await manager.query(
      `INSERT INTO order_sequences (tenant_id, last_number) VALUES (?, 0)
       ON DUPLICATE KEY UPDATE tenant_id = tenant_id`,
      [tenantId],
    );

    await manager.query(`SELECT last_number FROM order_sequences WHERE tenant_id = ? FOR UPDATE`, [tenantId]);
    await manager.query(`UPDATE order_sequences SET last_number = last_number + 1 WHERE tenant_id = ?`, [tenantId]);
    const rows = (await manager.query(`SELECT last_number AS lastNumber FROM order_sequences WHERE tenant_id = ?`, [
      tenantId,
    ])) as { lastNumber: string }[];

    const number = rows[0]?.lastNumber ?? '1';
    return `ORD-${number.padStart(6, '0')}`;
  }

  /** Batch reverse of the forward `resolveId`-style lookups — internal ids to public ids in another tenant-owned table. */
  async publicIdsFor(
    table: 'stores' | 'products' | 'product_variants',
    internalIds: (string | null)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(internalIds.filter((id): id is string => id !== null))];
    if (unique.length === 0) return new Map();
    const rows = await this.manager.query(
      `SELECT id, public_id AS publicId FROM \`${table}\`
        WHERE tenant_id = ? AND id IN (${unique.map(() => '?').join(',')})`,
      [this.tenantId, ...unique],
    );
    return new Map((rows as { id: string; publicId: string }[]).map((row) => [row.id, row.publicId]));
  }
}

@Injectable()
export class OrderItemRepository extends TenantScopedRepository<OrderItemEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, OrderItemEntity, context);
  }

  async findByOrder(orderId: string): Promise<OrderItemEntity[]> {
    return this.find({ where: { orderId }, order: { id: 'ASC' } });
  }
}

@Injectable()
export class OrderStatusHistoryRepository extends TenantScopedRepository<OrderStatusHistoryEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, OrderStatusHistoryEntity, context);
  }

  async findByOrder(orderId: string): Promise<OrderStatusHistoryEntity[]> {
    return this.find({ where: { orderId }, order: { createdAt: 'ASC' } });
  }

  async record(input: {
    orderId: string;
    statusType: OrderStatusHistoryEntity['statusType'];
    fromStatus: string | null;
    toStatus: string;
    reason?: string | null;
    actorType: OrderStatusHistoryEntity['actorType'];
    actorId?: string | null;
    correlationId?: string | null;
  }): Promise<void> {
    await this.insert({
      orderId: input.orderId,
      statusType: input.statusType,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reason: input.reason ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      correlationId: input.correlationId ?? null,
    });
  }
}
