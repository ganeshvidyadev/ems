import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
import { createHmac } from 'node:crypto';
import type { PaymentConfig } from '../../../config/configuration';
import type {
  CreateOrderInput,
  GatewayOrder,
  GatewayPayment,
  GatewayRefund,
  PaymentGatewayPort,
  RefundInput,
  VerifyPaymentInput,
  WebhookVerification,
} from '../payment-gateway.port';
import { safeEqualBase64 } from '../webhook-signature.util';

const API_VERSION = '2023-08-01';

interface CashfreeOrder {
  cf_order_id: string;
  order_id: string;
  order_status: 'ACTIVE' | 'PAID' | 'EXPIRED' | 'TERMINATED';
  order_amount: number;
  order_currency: string;
  payment_session_id?: string;
}

interface CashfreePaymentAttempt {
  cf_payment_id: string;
  order_id: string;
  payment_status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'USER_DROPPED' | 'NOT_ATTEMPTED';
  payment_amount: number;
  payment_currency: string;
  payment_method?: Record<string, unknown>;
  error_details?: { error_code?: string; error_description?: string } | null;
}

/**
 * Cashfree adapter (Payment Gateway API, `x-api-version: 2023-08-01`).
 *
 * Cashfree's Orders API is closer to Razorpay's shape than PayPal's — amounts
 * are decimal-major (not minor units, unusually for an Indian gateway), and
 * *we* choose the `order_id` rather than the gateway assigning one.
 */
@Injectable()
export class CashfreeAdapter implements PaymentGatewayPort {
  readonly name = 'cashfree' as const;
  private readonly logger = new Logger(CashfreeAdapter.name);
  private readonly config: PaymentConfig['cashfree'];
  private readonly apiBase: string;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<PaymentConfig>('payment').cashfree;
    this.apiBase =
      this.config.env === 'PRODUCTION' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  }

  isConfigured(): boolean {
    return Boolean(this.config.appId && this.config.secretKey);
  }

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    const response = await this.request<CashfreeOrder>('POST', '/orders', {
      // Cashfree assigns no order id of its own — the reference *is* the order id, which is
      // what makes a webhook or poll self-describing without a lookup table.
      order_id: input.reference,
      order_amount: this.toMajorUnits(input.amountMinor),
      order_currency: input.currency,
      customer_details: {
        customer_id: input.reference,
        customer_name: input.customer?.name || 'Guest',
        customer_email: input.customer?.email || 'guest@example.com',
        customer_phone: input.customer?.phone || '9999999999',
      },
    });

    return {
      orderId: response.order_id,
      amountMinor: input.amountMinor,
      currency: response.order_currency,
      status: response.order_status,
      clientPayload: {
        paymentSessionId: response.payment_session_id ?? null,
        orderId: response.order_id,
      },
    };
  }

  /** No client-side signature to check (see the class doc); the latest attempt's own status is authoritative. */
  async verifyPayment(input: VerifyPaymentInput): Promise<GatewayPayment> {
    return this.fetchPayment(input.orderId);
  }

  async fetchPayment(orderId: string): Promise<GatewayPayment> {
    const attempts = await this.request<CashfreePaymentAttempt[]>(
      'GET',
      `/orders/${encodeURIComponent(orderId)}/payments`,
    );

    // The most recent attempt is authoritative — a shopper can retry a
    // declined card, and only the latest attempt reflects that.
    const latest = attempts[0];
    if (!latest) {
      const order = await this.request<CashfreeOrder>('GET', `/orders/${encodeURIComponent(orderId)}`);
      return {
        paymentId: order.cf_order_id,
        orderId: order.order_id,
        status: 'PENDING',
        amountMinor: this.toMinorUnits(order.order_amount),
        currency: order.order_currency,
        method: null,
        failureCode: null,
        failureMessage: null,
        raw: order as unknown as Record<string, unknown>,
      };
    }

    return this.toPayment(latest);
  }

  async capturePayment(paymentId: string): Promise<GatewayPayment> {
    // Cashfree auto-captures; nothing left to do for a manual second step.
    return this.fetchPayment(paymentId);
  }

  async refund(input: RefundInput): Promise<GatewayRefund> {
    const response = await this.request<{ refund_id: string; cf_refund_id: string; refund_amount: number; refund_status: string }>(
      'POST',
      `/orders/${encodeURIComponent(input.paymentId)}/refunds`,
      {
        // Cashfree requires a merchant-chosen, unique refund_id — the idempotency key doubles
        // as it, so a retried refund request is the same refund rather than a second one.
        refund_id: input.idempotencyKey ?? `rfnd_${Date.now()}`,
        refund_amount: input.amountMinor ? Number(this.toMajorUnits(input.amountMinor)) : undefined,
        refund_note: input.reason,
      },
      input.idempotencyKey,
    );

    return {
      refundId: response.cf_refund_id,
      paymentId: input.paymentId,
      amountMinor: this.toMinorUnits(response.refund_amount),
      status: response.refund_status,
      raw: response as unknown as Record<string, unknown>,
    };
  }

  /**
   * Verifies `x-webhook-signature` (base64 HMAC-SHA256 of `timestamp + rawBody`)
   * against `x-webhook-timestamp` — the same "timestamp folded into the signed
   * payload" shape as Stripe's, just base64 instead of hex.
   */
  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookVerification> {
    const sigHeader = headers['x-webhook-signature'];
    const tsHeader = headers['x-webhook-timestamp'];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    const timestamp = Array.isArray(tsHeader) ? tsHeader[0] : tsHeader;

    if (!signature || !timestamp || !this.config.webhookSecret) {
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    const expected = createHmac('sha256', this.config.webhookSecret)
      .update(`${timestamp}${rawBody.toString('utf8')}`)
      .digest('base64');

    if (!safeEqualBase64(expected, signature)) {
      this.logger.warn('Rejected a Cashfree webhook with an invalid signature');
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    const data = payload['data'] as { order?: { order_id?: string } } | undefined;
    return {
      valid: true,
      event: typeof payload['type'] === 'string' ? payload['type'] : null,
      // Cashfree sends no top-level event id — the order id plus timestamp is the closest
      // stable key, matching Razorpay's same limitation.
      eventId: data?.order?.order_id ? `${data.order.order_id}:${timestamp}` : null,
      payload,
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new ExternalServiceError('cashfree', 'Cashfree credentials are not configured');
    }

    const headers: Record<string, string> = {
      'x-client-id': this.config.appId,
      'x-client-secret': this.config.secretKey,
      'x-api-version': API_VERSION,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${this.apiBase}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        let message = text.slice(0, 300);
        try {
          const parsed = JSON.parse(text) as { message?: string };
          message = parsed.message ?? message;
        } catch {
          /* keep the raw text */
        }
        throw new ExternalServiceError('cashfree', message, { status: response.status, path });
      }

      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError('cashfree', 'Request timed out after 15s', { path });
      }
      throw new ExternalServiceError('cashfree', error instanceof Error ? error.message : String(error), { path });
    } finally {
      clearTimeout(timeout);
    }
  }

  private toMajorUnits(amountMinor: string): number {
    const negative = amountMinor.startsWith('-');
    const digits = negative ? amountMinor.slice(1) : amountMinor;
    const padded = digits.padStart(3, '0');
    const value = Number(`${padded.slice(0, -2)}.${padded.slice(-2)}`);
    return negative ? -value : value;
  }

  private toMinorUnits(major: number): string {
    return Math.round(major * 100).toString();
  }

  private toPayment(attempt: CashfreePaymentAttempt): GatewayPayment {
    return {
      paymentId: attempt.cf_payment_id,
      orderId: attempt.order_id,
      status: mapStatus(attempt.payment_status),
      amountMinor: this.toMinorUnits(attempt.payment_amount),
      currency: attempt.payment_currency,
      method: attempt.payment_method ? Object.keys(attempt.payment_method)[0] ?? null : null,
      failureCode: attempt.error_details?.error_code ?? null,
      failureMessage: attempt.error_details?.error_description ?? null,
      raw: attempt as unknown as Record<string, unknown>,
    };
  }
}

function mapStatus(status: CashfreePaymentAttempt['payment_status']): GatewayPayment['status'] {
  switch (status) {
    case 'SUCCESS':
      return 'CAPTURED';
    case 'FAILED':
    case 'USER_DROPPED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}
