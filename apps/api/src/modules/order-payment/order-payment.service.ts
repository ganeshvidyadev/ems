import { Injectable, Logger } from '@nestjs/common';
import { Money, type CurrencyCode } from '@ems/kernel';
import type { EntityManager } from 'typeorm';
import { PaymentAlreadyCapturedError, RefundExceedsPaymentError } from '../../common/errors/api.errors';
import { RequestContextService } from '../../common/services/request-context.service';
import type { PaymentEntity, PaymentGateway, RefundEntity } from '../../database/entities';
import { PaymentGatewayFactory } from '../../integrations/payment/payment-gateway.factory';
import type { GatewayName, GatewayPayment } from '../../integrations/payment/payment-gateway.port';
import { OrderPaymentRepository, RefundRepository } from './order-payment.repository';

export interface OpenPaymentSessionInput {
  orderId: string;
  storeId: string;
  amount: Money;
  gateway: PaymentGateway;
  idempotencyKey: string;
  customer?: { name?: string; email?: string; phone?: string };
  description: string;
}

export interface PaymentSession {
  payment: PaymentEntity;
  clientPayload: Record<string, unknown> | null;
}

@Injectable()
export class OrderPaymentService {
  private readonly logger = new Logger(OrderPaymentService.name);

  constructor(
    private readonly payments: OrderPaymentRepository,
    private readonly refunds: RefundRepository,
    private readonly gateways: PaymentGatewayFactory,
    private readonly context: RequestContextService,
  ) {}

  /**
   * Opens (or reopens) a payment for one order.
   *
   * An existing row for the same idempotency key is reused rather than
   * replaced — the same reasoning `PaymentService.createCheckout` documents
   * for subscription invoices: a retried checkout must reopen the same
   * gateway order, not create a second one a double-click could pay twice.
   */
  async open(manager: EntityManager, input: OpenPaymentSessionInput): Promise<PaymentSession> {
    const scoped = this.payments.withManager(manager);

    const existing = await scoped.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return {
        payment: existing,
        clientPayload: (existing.gatewayResponse?.['clientPayload'] as Record<string, unknown>) ?? null,
      };
    }

    // Cash on delivery never touches a gateway: the "payment" is a promise to
    // collect on delivery, not a transaction we can create or verify today.
    if (input.gateway === 'COD') {
      const payment = await scoped.insert({
        storeId: input.storeId,
        orderId: input.orderId,
        subscriptionInvoiceId: null,
        gateway: 'COD',
        method: 'COD',
        status: 'PENDING',
        amountMinor: input.amount.amountMinor.toString(),
        currency: input.amount.currency,
        idempotencyKey: input.idempotencyKey,
        correlationId: this.context.correlationId ?? null,
      });
      return { payment, clientPayload: null };
    }

    const gateway = this.gateways.resolve(input.gateway.toLowerCase() as GatewayName);
    const order = await gateway.createOrder({
      amountMinor: input.amount.amountMinor.toString(),
      currency: input.amount.currency,
      reference: input.orderId,
      description: input.description,
      customer: input.customer,
      idempotencyKey: input.idempotencyKey,
      metadata: { orderId: input.orderId },
    });

    const payment = await scoped.insert({
      storeId: input.storeId,
      orderId: input.orderId,
      subscriptionInvoiceId: null,
      gateway: input.gateway,
      status: 'PENDING',
      amountMinor: input.amount.amountMinor.toString(),
      currency: input.amount.currency,
      gatewayOrderId: order.orderId,
      idempotencyKey: input.idempotencyKey,
      gatewayResponse: { clientPayload: order.clientPayload },
      correlationId: this.context.correlationId ?? null,
    });

    return { payment, clientPayload: order.clientPayload };
  }

  /**
   * Verifies a client-reported callback against the gateway's signature, then
   * reads the real status back from the gateway rather than trusting the
   * browser (docs/01 §9) — mirrors `PaymentService.confirmCheckout`.
   */
  async verifyCallback(
    gatewayName: GatewayName,
    gatewayOrderId: string,
    gatewayPaymentId: string,
    signature: string,
  ): Promise<GatewayPayment> {
    const gateway = this.gateways.resolve(gatewayName);
    return gateway.verifyPayment({ orderId: gatewayOrderId, paymentId: gatewayPaymentId, signature });
  }

  /** Records a verified capture/failure onto our own row. Idempotent — a second call on an already-settled payment is a no-op. */
  async settle(manager: EntityManager, paymentId: string, result: GatewayPayment): Promise<PaymentEntity> {
    const scoped = this.payments.withManager(manager);
    const payment = await scoped.findOneOrFail({ where: { id: paymentId } });

    if (payment.status === 'CAPTURED') return payment; // already settled — the other race winner got here first

    if (result.status !== 'CAPTURED' && result.status !== 'AUTHORIZED') {
      Object.assign(payment, {
        status: 'FAILED',
        errorCode: result.failureCode ?? null,
        errorMessage: result.failureMessage?.slice(0, 500) ?? null,
        gatewayPaymentId: result.paymentId,
        gatewayResponse: result.raw,
        failedAt: new Date(),
      });
      await scoped.save(payment);
      return payment;
    }

    const collected = result.amountMinor;
    if (collected !== payment.amountMinor) {
      this.logger.warn(
        `Order payment ${payment.publicId} collected ${collected} but ${payment.amountMinor} was expected`,
      );
    }

    Object.assign(payment, {
      status: 'CAPTURED',
      gatewayPaymentId: result.paymentId,
      method: result.method,
      amountCapturedMinor: collected,
      gatewayResponse: result.raw,
      errorCode: null,
      errorMessage: null,
      capturedAt: new Date(),
    });
    await scoped.save(payment);
    return payment;
  }

  /** Marks a COD payment collected on delivery. */
  async markCodCollected(manager: EntityManager, paymentId: string): Promise<PaymentEntity> {
    const scoped = this.payments.withManager(manager);
    const payment = await scoped.findOneOrFail({ where: { id: paymentId } });
    Object.assign(payment, {
      status: 'CAPTURED',
      amountCapturedMinor: payment.amountMinor,
      capturedAt: new Date(),
    });
    await scoped.save(payment);
    return payment;
  }

  async findByOrder(orderId: string): Promise<PaymentEntity[]> {
    return this.payments.findByOrder(orderId);
  }

  async findByGatewayRef(gateway: string, gatewayOrderId: string | null, gatewayPaymentId: string | null) {
    return this.payments.findByGatewayRef(gateway, gatewayOrderId, gatewayPaymentId);
  }

  async findStalePending(olderThanMinutes: number, limit: number): Promise<PaymentEntity[]> {
    return this.payments.findStalePending(olderThanMinutes, limit);
  }

  /** Reads the gateway's own record for a payment — used by the reconciliation sweep. */
  async fetchAuthoritative(gateway: string, gatewayPaymentId: string): Promise<GatewayPayment> {
    const adapter = this.gateways.resolve(gateway.toLowerCase() as GatewayName);
    return adapter.fetchPayment(gatewayPaymentId);
  }

  // =========================================================================
  // Refunds
  // =========================================================================

  async refund(
    manager: EntityManager,
    payment: PaymentEntity,
    amount: Money | null,
    reason: string | null,
    returnId: string | null,
    idempotencyKey: string,
  ): Promise<RefundEntity> {
    const scopedPayments = this.payments.withManager(manager);
    const scopedRefunds = this.refunds.withManager(manager);

    const existing = await scopedRefunds.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    if (payment.status !== 'CAPTURED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new PaymentAlreadyCapturedError('Only a captured payment can be refunded');
    }

    const currency = payment.currency as CurrencyCode;
    const refundable = Money.fromMinor(payment.amountCapturedMinor, currency).subtract(
      Money.fromMinor(payment.amountRefundedMinor, currency),
    );
    const requested = amount ?? refundable;

    if (requested.greaterThan(refundable)) {
      throw new RefundExceedsPaymentError(requested.amountMinor.toString(), refundable.amountMinor.toString());
    }

    let gatewayRefundId: string | null = null;
    if (payment.gateway !== 'COD') {
      const gateway = this.gateways.resolve(payment.gateway.toLowerCase() as GatewayName);
      const result = await gateway.refund({
        paymentId: payment.gatewayPaymentId ?? payment.publicId,
        amountMinor: requested.amountMinor.toString(),
        reason: reason ?? undefined,
        idempotencyKey,
      });
      gatewayRefundId = result.refundId;
    }

    const refund = await scopedRefunds.insert({
      paymentId: payment.id,
      orderId: payment.orderId,
      returnId,
      amountMinor: requested.amountMinor.toString(),
      currency: payment.currency,
      reason,
      status: 'COMPLETED',
      gatewayRefundId,
      idempotencyKey,
      processedAt: new Date(),
    });

    const newRefunded = Money.fromMinor(payment.amountRefundedMinor, currency).add(requested);
    Object.assign(payment, {
      amountRefundedMinor: newRefunded.amountMinor.toString(),
      status: newRefunded.equals(Money.fromMinor(payment.amountCapturedMinor, currency))
        ? 'REFUNDED'
        : 'PARTIALLY_REFUNDED',
    });
    await scopedPayments.save(payment);

    return refund;
  }
}
