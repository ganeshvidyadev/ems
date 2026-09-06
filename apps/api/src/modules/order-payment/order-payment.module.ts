import { Global, Module } from '@nestjs/common';
import { OrderPaymentRepository, RefundRepository } from './order-payment.repository';
import { OrderPaymentService } from './order-payment.service';

/**
 * Order payments and refunds — the `payments`/`refunds` tables, distinct from
 * `subscription_payments` (platform billing). No controller of its own:
 * checkout owns the HTTP surface (place order, confirm payment, webhook,
 * refund) since every one of those routes also has to touch the order and,
 * for refunds, inventory/loyalty — this module stays the narrow layer under
 * that orchestration. `@Global()` so checkout, and returns in the order
 * module, can both reach it without a module import edge.
 */
@Global()
@Module({
  providers: [OrderPaymentRepository, RefundRepository, OrderPaymentService],
  exports: [OrderPaymentService, OrderPaymentRepository, RefundRepository],
})
export class OrderPaymentModule {}
