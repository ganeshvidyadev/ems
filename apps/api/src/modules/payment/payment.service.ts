import { Injectable, Logger } from '@nestjs/common';
import {
  BusinessRuleError,
  NotFoundError,
  newPublicId,
  type CurrencyCode,
} from '@ems/kernel';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  SubscriptionInvoiceEntity,
  SubscriptionPaymentEntity,
  TenantEntity,
} from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { OutboxService } from '../../common/services/outbox.service';
import { PaymentGatewayFactory } from '../../integrations/payment/payment-gateway.factory';
import type { GatewayName } from '../../integrations/payment/payment-gateway.port';
import { InvoiceService } from '../subscription/services/invoice.service';
import { SubscriptionService } from '../subscription/services/subscription.service';

export interface CheckoutSession {
  paymentPublicId: string;
  invoiceNumber: string;
  amountMinor: string;
  currency: string;
  gateway: GatewayName;
  clientPayload: Record<string, unknown>;
}

/**
 * Subscription payment collection.
 *
 * Three invariants shape this class:
 *
 *  1. **The client is never believed.** A browser reporting success proves nothing; the
 *     signature is verified and the status is then read back from the gateway.
 *  2. **Money is recorded once.** `uq_sub_payments_gateway_payment` makes a duplicate
 *     capture a constraint violation rather than a second row, so a replayed webhook cannot
 *     double-credit an invoice.
 *  3. **Settlement is transactional.** Marking the invoice paid, recording the payment, and
 *     reactivating the subscription happen together — a partial commit here means a merchant
 *     who paid but is still locked out.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly gateways: PaymentGatewayFactory,
    private readonly invoices: InvoiceService,
    private readonly subscriptions: SubscriptionService,
    private readonly outbox: OutboxService,
    private readonly context: RequestContextService,
  ) {}

  // =========================================================================
  // Checkout
  // =========================================================================

  /**
   * Opens a checkout session for an unpaid invoice.
   *
   * An existing PENDING payment for the same invoice is **reused** rather than replaced.
   * Creating a fresh gateway order on every page refresh would leave a trail of abandoned
   * orders and, worse, allow two live orders for one invoice — so a double-click could pay
   * twice.
   */
  async createCheckout(
    invoicePublicId: string,
    gatewayName?: GatewayName,
    idempotencyKey?: string,
  ): Promise<CheckoutSession> {
    const tenantId = this.context.requireTenantId('create checkout');

    const invoice = await this.dataSource
      .getRepository(SubscriptionInvoiceEntity)
      .findOne({ where: { publicId: invoicePublicId, tenantId } });

    if (!invoice) throw new NotFoundError('Invoice', invoicePublicId);
    if (invoice.status === 'PAID') {
      throw new BusinessRuleError('This invoice is already paid');
    }
    if (invoice.status === 'VOID') {
      throw new BusinessRuleError('This invoice has been voided');
    }
    if (invoice.amountDueMinor === '0') {
      throw new BusinessRuleError('This invoice has nothing outstanding');
    }

    const existing = await this.dataSource.getRepository(SubscriptionPaymentEntity).findOne({
      where: { tenantId, invoiceId: invoice.id, status: 'PENDING' },
    });

    const gateway = this.gateways.resolve(gatewayName);

    if (existing?.gatewayOrderId && existing.gateway === gateway.name) {
      // Re-open the same gateway order.
      return {
        paymentPublicId: existing.publicId,
        invoiceNumber: invoice.invoiceNumber,
        amountMinor: existing.amountMinor,
        currency: existing.currency,
        gateway: gateway.name,
        clientPayload: (existing.gatewayPayload?.['clientPayload'] as Record<string, unknown>) ?? {},
      };
    }

    const tenant = await this.dataSource
      .getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });

    const order = await gateway.createOrder({
      amountMinor: invoice.amountDueMinor,
      currency: invoice.currency,
      // Our own reference, echoed back by the gateway so a webhook maps to this invoice
      // without a lookup table.
      reference: invoice.invoiceNumber,
      description: `${tenant?.businessName ?? 'Subscription'} — ${invoice.invoiceNumber}`,
      customer: {
        name: tenant?.businessName,
        email: tenant?.contactEmail,
        phone: tenant?.contactPhone ?? undefined,
      },
      idempotencyKey,
      metadata: { tenantId, invoiceId: invoice.id },
    });

    const payment = await this.dataSource.getRepository(SubscriptionPaymentEntity).save(
      this.dataSource.getRepository(SubscriptionPaymentEntity).create({
        publicId: newPublicId(),
        tenantId,
        subscriptionId: invoice.subscriptionId,
        invoiceId: invoice.id,
        gateway: gateway.name,
        gatewayOrderId: order.orderId,
        status: 'PENDING',
        amountMinor: invoice.amountDueMinor,
        currency: invoice.currency,
        idempotencyKey: idempotencyKey ?? null,
        gatewayPayload: { clientPayload: order.clientPayload },
      }),
    );

    return {
      paymentPublicId: payment.publicId,
      invoiceNumber: invoice.invoiceNumber,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      gateway: gateway.name,
      clientPayload: order.clientPayload,
    };
  }

  // =========================================================================
  // Confirmation
  // =========================================================================

  /**
   * Verifies a checkout callback and settles the invoice.
   *
   * The signature is checked and then the payment's real state is fetched from the gateway —
   * a valid signature proves the ids came from the provider, not that the money moved.
   */
  async confirmCheckout(
    gatewayName: GatewayName,
    orderId: string,
    paymentId: string,
    signature: string,
  ): Promise<{ status: string; invoiceNumber: string | null }> {
    const gateway = this.gateways.resolve(gatewayName);
    const result = await gateway.verifyPayment({ orderId, paymentId, signature });

    return this.settle(gatewayName, result.paymentId, orderId, result);
  }

  /**
   * Records the outcome against our own rows.
   *
   * Shared by the callback and the webhook paths, so both converge on identical state — the
   * webhook usually arrives first, and whichever loses the race must be a no-op rather than
   * a second settlement.
   */
  async settle(
    gatewayName: GatewayName,
    paymentId: string,
    orderId: string | null,
    result: {
      status: string;
      amountMinor: string;
      currency: string;
      method: string | null;
      failureCode?: string | null;
      failureMessage?: string | null;
      raw: Record<string, unknown>;
    },
  ): Promise<{ status: string; invoiceNumber: string | null }> {
    return this.dataSource.transaction(async (manager) => {
      // Locate our row by the gateway order id — set when checkout opened.
      const rows = (await manager.query(
        `SELECT id, tenant_id AS tenantId, invoice_id AS invoiceId,
                subscription_id AS subscriptionId, status, amount_minor AS amountMinor,
                currency
           FROM subscription_payments
          WHERE gateway = ? AND (gateway_order_id = ? OR gateway_payment_id = ?)
          LIMIT 1
          FOR UPDATE`,
        [gatewayName, orderId, paymentId],
      )) as {
        id: string;
        tenantId: string;
        invoiceId: string | null;
        subscriptionId: string | null;
        status: string;
        amountMinor: string;
        currency: string;
      }[];

      const payment = rows[0];
      if (!payment) {
        // A webhook for something we never created. Logged, not thrown: retrying will not
        // conjure the row, and a 500 would make the gateway redeliver forever.
        this.logger.warn(
          `Received ${gatewayName} payment ${paymentId} with no matching local record`,
        );
        return { status: result.status, invoiceNumber: null };
      }

      // Already settled — the other path won the race. Idempotent by design.
      if (payment.status === 'CAPTURED') {
        return { status: 'CAPTURED', invoiceNumber: null };
      }

      if (result.status !== 'CAPTURED' && result.status !== 'AUTHORIZED') {
        await manager.query(
          `UPDATE subscription_payments
              SET status = 'FAILED', failure_code = ?, failure_message = ?,
                  failed_at = NOW(3), gateway_payment_id = ?, gateway_payload = ?
            WHERE id = ?`,
          [
            result.failureCode ?? null,
            result.failureMessage?.slice(0, 500) ?? null,
            paymentId,
            JSON.stringify(result.raw),
            payment.id,
          ],
        );

        if (payment.subscriptionId) {
          // Outside this transaction's concern but inside the same request — dunning state
          // is the subscription's business.
          await this.subscriptions.recordPaymentFailure(
            payment.subscriptionId,
            result.failureMessage ?? 'Payment failed',
          );
        }

        return { status: 'FAILED', invoiceNumber: null };
      }

      /*
       * Amount check.
       *
       * The gateway is authoritative on how much was actually collected. If it differs from
       * what we asked for, the invoice must be credited with what arrived — not with what we
       * hoped for. Trusting our own figure here is how a partial payment silently settles a
       * full invoice.
       */
      const collected = result.amountMinor;
      if (collected !== payment.amountMinor) {
        this.logger.warn(
          `Payment ${paymentId} collected ${collected} but ${payment.amountMinor} was due; ` +
            `crediting the collected amount`,
        );
      }

      await manager.query(
        `UPDATE subscription_payments
            SET status = 'CAPTURED', gateway_payment_id = ?, method = ?,
                captured_at = NOW(3), gateway_payload = ?, failure_code = NULL,
                failure_message = NULL
          WHERE id = ?`,
        [paymentId, result.method, JSON.stringify(result.raw), payment.id],
      );

      let invoiceNumber: string | null = null;

      if (payment.invoiceId) {
        const invoice = await this.invoices.applyPayment(
          manager,
          payment.invoiceId,
          collected,
          payment.currency as CurrencyCode,
        );
        invoiceNumber = invoice.invoiceNumber;
      }

      await this.outbox.emit(manager, {
        aggregateType: 'Payment',
        aggregateId: payment.id,
        eventType: 'payment.captured',
        payload: {
          paymentId: payment.id,
          tenantId: payment.tenantId,
          invoiceId: payment.invoiceId,
          gateway: gatewayName,
          gatewayPaymentId: paymentId,
          amountMinor: collected,
          currency: payment.currency,
        },
        tenantId: payment.tenantId,
      });

      // Restores a PAST_DUE or SUSPENDED tenant. Deliberately after the invoice is settled,
      // so a tenant is never reactivated on a payment that failed to record.
      if (payment.subscriptionId) {
        await this.subscriptions.recordPaymentSuccess(payment.subscriptionId);
      }

      return { status: 'CAPTURED', invoiceNumber };
    });
  }

  // =========================================================================
  // Reconciliation
  // =========================================================================

  /**
   * Re-checks PENDING payments against the gateway.
   *
   * Needed because webhooks get lost, and a shopper who closes the tab mid-redirect never
   * triggers the callback. Without this, money can sit collected at the gateway while our
   * invoice stays open and the tenant gets suspended for non-payment.
   */
  async reconcilePending(olderThanMinutes = 10, limit = 50): Promise<number> {
    const rows = (await this.dataSource.query(
      `SELECT id, gateway, gateway_order_id AS orderId, gateway_payment_id AS paymentId
         FROM subscription_payments
        WHERE status = 'PENDING'
          AND created_at < DATE_SUB(NOW(3), INTERVAL ? MINUTE)
        ORDER BY created_at
        LIMIT ?`,
      [olderThanMinutes, limit],
    )) as { id: string; gateway: GatewayName; orderId: string | null; paymentId: string | null }[];

    let settled = 0;

    for (const row of rows) {
      // Nothing to query the gateway with — the order never got created.
      if (!row.paymentId) continue;

      try {
        const gateway = this.gateways.resolve(row.gateway);
        const result = await gateway.fetchPayment(row.paymentId);

        if (result.status === 'CAPTURED' || result.status === 'FAILED') {
          await this.settle(row.gateway, result.paymentId, row.orderId, result);
          settled += 1;
        }
      } catch (error) {
        // One unreachable gateway must not stop the sweep for the others.
        this.logger.warn(
          `Reconciliation failed for payment ${row.id}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    return settled;
  }
}
