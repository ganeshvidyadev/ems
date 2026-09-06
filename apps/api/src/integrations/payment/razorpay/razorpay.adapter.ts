import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
import { createHmac, timingSafeEqual } from 'node:crypto';
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

const API_BASE = 'https://api.razorpay.com/v1';

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

interface RazorpayPaymentResponse {
  id: string;
  order_id: string | null;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amount: number;
  currency: string;
  method: string | null;
  error_code?: string | null;
  error_description?: string | null;
  captured?: boolean;
}

/**
 * Razorpay adapter.
 *
 * Chosen as the first real gateway because the primary market is India, and proving the
 * port with **one** complete integration is worth more than five half-finished ones
 * (docs/05 Phase 3).
 *
 * Razorpay works in minor units natively (paise), which lines up with our `BIGINT` money
 * representation — no conversion, so no rounding.
 */
@Injectable()
export class RazorpayAdapter implements PaymentGatewayPort {
  readonly name = 'razorpay' as const;
  private readonly logger = new Logger(RazorpayAdapter.name);
  private readonly config: PaymentConfig['razorpay'];

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<PaymentConfig>('payment').razorpay;
  }

  isConfigured(): boolean {
    return Boolean(this.config.keyId && this.config.keySecret);
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    const response = await this.request<RazorpayOrderResponse>('POST', '/orders', {
      // Razorpay expects an integer in the smallest unit — the same thing we store.
      amount: Number(input.amountMinor),
      currency: input.currency,
      // Our reference, echoed back on the order and in webhooks so a payment can be matched
      // to an invoice without a lookup table.
      receipt: input.reference.slice(0, 40),
      notes: {
        ...(input.metadata ?? {}),
        reference: input.reference,
      },
    }, input.idempotencyKey);

    return {
      orderId: response.id,
      amountMinor: String(response.amount),
      currency: response.currency,
      status: response.status,
      clientPayload: {
        // The publishable key only. The secret must never reach a browser.
        key: this.config.keyId,
        orderId: response.id,
        amount: response.amount,
        currency: response.currency,
        name: input.description,
        prefill: {
          name: input.customer?.name ?? '',
          email: input.customer?.email ?? '',
          contact: input.customer?.phone ?? '',
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Verification
  // -------------------------------------------------------------------------

  /**
   * Verifies the checkout callback.
   *
   * Razorpay signs `order_id|payment_id` with the API secret. Recomputing that HMAC is the
   * only thing standing between us and a forged success — the browser's claim carries no
   * weight, and a user who edits the callback could otherwise mark any invoice paid.
   */
  async verifyPayment(input: VerifyPaymentInput): Promise<GatewayPayment> {
    const expected = createHmac('sha256', this.config.keySecret)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest('hex');

    if (!safeEqualHex(expected, input.signature)) {
      throw new ExternalServiceError('razorpay', 'Payment signature verification failed', {
        orderId: input.orderId,
      });
    }

    // Signature proves the ids came from Razorpay, but not the payment's current state —
    // so status and amount are read from the API rather than trusted from the callback.
    return this.fetchPayment(input.paymentId);
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const response = await this.request<RazorpayPaymentResponse>(
      'GET',
      `/payments/${encodeURIComponent(paymentId)}`,
    );
    return this.toPayment(response);
  }

  async capturePayment(
    paymentId: string,
    amountMinor: string,
    currency: string,
  ): Promise<GatewayPayment> {
    const current = await this.fetchPayment(paymentId);

    // Already captured — return as-is rather than calling capture again, which Razorpay
    // rejects. Makes the method safe to retry.
    if (current.status === 'CAPTURED') return current;

    const response = await this.request<RazorpayPaymentResponse>(
      'POST',
      `/payments/${encodeURIComponent(paymentId)}/capture`,
      { amount: Number(amountMinor), currency },
    );

    return this.toPayment(response);
  }

  async refund(input: RefundInput): Promise<GatewayRefund> {
    const body: Record<string, unknown> = {};
    // Omitting `amount` means a full refund in Razorpay's API.
    if (input.amountMinor) body.amount = Number(input.amountMinor);
    if (input.reason) body.notes = { reason: input.reason };

    const response = await this.request<{ id: string; payment_id: string; amount: number; status: string }>(
      'POST',
      `/payments/${encodeURIComponent(input.paymentId)}/refund`,
      body,
      input.idempotencyKey,
    );

    return {
      refundId: response.id,
      paymentId: response.payment_id,
      amountMinor: String(response.amount),
      status: response.status,
      raw: response as unknown as Record<string, unknown>,
    };
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  /**
   * Verifies an inbound webhook.
   *
   * HMAC-SHA256 over the **raw body** with the webhook secret — which is a different secret
   * from the API key, so a leaked key cannot be used to forge events.
   */

  /** Verifies locally (HMAC) — `async` only for parity with the port signature. */
  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookVerification> {
    const header = headers['x-razorpay-signature'];
    const signature = Array.isArray(header) ? header[0] : header;

    if (!signature || !this.config.webhookSecret) {
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    const expected = createHmac('sha256', this.config.webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!safeEqualHex(expected, signature)) {
      this.logger.warn('Rejected a Razorpay webhook with an invalid signature');
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    return {
      valid: true,
      event: typeof payload['event'] === 'string' ? payload['event'] : null,
      // Razorpay does not send a top-level event id, so the payment/order id inside the
      // payload serves as the replay key.
      eventId: extractEntityId(payload),
      payload,
    };
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new ExternalServiceError('razorpay', 'Razorpay credentials are not configured');
    }

    const auth = Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString('base64');

    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['X-Razorpay-Idempotency-Key'] = idempotencyKey;

    // A hung gateway call must not hold a request open indefinitely; 15s is well beyond
    // Razorpay's normal latency and short enough to fail before the client gives up.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        // Razorpay's error description is safe to surface — it is written for merchants
        // ("card declined") rather than exposing anything internal.
        let description = text.slice(0, 300);
        try {
          const parsed = JSON.parse(text) as { error?: { description?: string; code?: string } };
          description = parsed.error?.description ?? description;
        } catch {
          /* keep the raw text */
        }

        throw new ExternalServiceError('razorpay', description, {
          status: response.status,
          path,
        });
      }

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError('razorpay', 'Request timed out after 15s', { path });
      }
      throw new ExternalServiceError(
        'razorpay',
        error instanceof Error ? error.message : String(error),
        { path },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private toPayment(response: RazorpayPaymentResponse): GatewayPayment {
    return {
      paymentId: response.id,
      orderId: response.order_id,
      status: mapStatus(response.status),
      amountMinor: String(response.amount),
      currency: response.currency,
      method: response.method,
      failureCode: response.error_code ?? null,
      failureMessage: response.error_description ?? null,
      // `card` is dropped: Razorpay includes last4 and network, and none of it belongs in
      // our database (SAQ-A). Only non-card fields are retained for dispute evidence.
      raw: stripCardData(response as unknown as Record<string, unknown>),
    };
  }
}

function mapStatus(status: RazorpayPaymentResponse['status']): GatewayPayment['status'] {
  switch (status) {
    case 'captured':
      return 'CAPTURED';
    case 'authorized':
      return 'AUTHORIZED';
    case 'refunded':
      return 'REFUNDED';
    case 'failed':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

/**
 * Constant-time hex comparison.
 *
 * `===` on a signature leaks its prefix through timing, which is enough to forge one byte
 * at a time given enough attempts. Length is compared first because `timingSafeEqual`
 * throws on a mismatch — and the length is not the secret.
 */
function safeEqualHex(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

/** Removes card-shaped fields before anything is persisted. */
function stripCardData(payload: Record<string, unknown>): Record<string, unknown> {
  const { card, card_id: cardId, token_id: tokenId, ...safe } = payload;
  void card;
  void cardId;
  void tokenId;
  return safe;
}

function extractEntityId(payload: Record<string, unknown>): string | null {
  const container = payload['payload'] as Record<string, unknown> | undefined;
  if (!container) return null;

  for (const key of ['payment', 'order', 'refund']) {
    const wrapper = container[key] as { entity?: { id?: string } } | undefined;
    if (wrapper?.entity?.id) return wrapper.entity.id;
  }
  return null;
}
