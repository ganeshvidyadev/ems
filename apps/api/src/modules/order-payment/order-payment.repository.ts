import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { PaymentEntity, RefundEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class OrderPaymentRepository extends TenantScopedRepository<PaymentEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, PaymentEntity, context);
  }

  async findByOrder(orderId: string): Promise<PaymentEntity[]> {
    return this.find({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  async findByGatewayRef(gateway: string, gatewayOrderId: string | null, gatewayPaymentId: string | null) {
    return this.findOne({
      where: [
        ...(gatewayOrderId ? [{ gateway: gateway as never, gatewayOrderId }] : []),
        ...(gatewayPaymentId ? [{ gateway: gateway as never, gatewayPaymentId }] : []),
      ],
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<PaymentEntity | null> {
    return this.findOne({ where: { idempotencyKey } });
  }

  /** PENDING payments old enough that a webhook should already have arrived — the reconciler's candidate set. */
  async findStalePending(olderThanMinutes: number, limit: number): Promise<PaymentEntity[]> {
    return this.repository
      .createQueryBuilder('payment')
      .where('payment.tenantId = :tenantId', { tenantId: this.tenantId })
      .andWhere('payment.status IN (:...statuses)', { statuses: ['PENDING', 'AUTHORIZED'] })
      .andWhere('payment.gateway != :cod', { cod: 'COD' })
      .andWhere('payment.createdAt < :cutoff', { cutoff: new Date(Date.now() - olderThanMinutes * 60_000) })
      .orderBy('payment.createdAt', 'ASC')
      .take(limit)
      .getMany();
  }
}

@Injectable()
export class RefundRepository extends TenantScopedRepository<RefundEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, RefundEntity, context);
  }

  async findByPayment(paymentId: string): Promise<RefundEntity[]> {
    return this.find({ where: { paymentId }, order: { createdAt: 'DESC' } });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<RefundEntity | null> {
    return this.findOne({ where: { idempotencyKey } });
  }
}
