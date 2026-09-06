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
import { safeEqualHex } from '../webhook-signature.util';

const API_BASE = 'https://api.stripe.com/v1';
/** Stripe's own tolerance recommendation for a valid-but-stale signature. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status:
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'processing'
    | 'requires_capture'
    | 'succeeded'
    | 'canceled';
  client_secret: string;
  latest_charge: string | null;
  payment_method_types?: string[];
  last_payment_error?: { code?: string; message?: string } | null;
}

/**
 * Stripe adapter.
 *
 * Unlike Razorpay, Stripe's checkout confirmation happens client-side via
 * Stripe.js against the PaymentIntent's `client_secret` — there is no
 * signature for us to verify on the callback the way Razorpay's modal
 * provides one. `verifyPayment` therefore ignores `input.signature` and,
 * exactly like every other adapter, treats the gateway's own API as the only
 * authority on what actually happened (docs/01 §9): it re-fetches the
 * PaymentIntent and reports its real status.
 *
 * Stripe's REST API takes `application/x-www-form-urlencoded` bodies, not
 * JSON — the one persistent surprise porting from Razorpay.
 */
@Injectable()
export class StripeAdapter implements PaymentGatewayPort {
  readonly name = 'stripe' as const;
  private readonly logger = new Logger(StripeAdapter.name);
  private readonly config: PaymentConfig['stripe'];

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<PaymentConfig>('payment').stripe;
  }

  isConfigured(): boolean {
    return Boolean(this.config.secretKey);
  }

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    const response = await this.request<StripePaymentIntent>(
      'POST',
      '/payment_intents',
      {
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        description: input.description,
        'automatic_payment_methods[enabled]': 'true',
        'metadata[reference]': input.reference,
        ...(input.metadata
          ? Object.fromEntries(Object.entries(input.metadata).map(([k, v]) => [`metadata[${k}]`, v]))
          : {}),
      },
      input.idempotencyKey,
    );

    return {
      orderId: response.id,
      amountMinor: String(response.amount),
      currency: response.currency.toUpperCase(),
      status: response.status,
      clientPayload: {
        publishableKey: this.config.publishableKey,
        clientSecret: response.client_secret,
        paymentIntentId: response.id,
      },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<GatewayPayment> {
    // No merchant-side signature to check here — see the class doc comment.
    return this.fetchPayment(input.orderId || input.paymentId);
  }

  async fetchPayment(paymentIntentId: string): Promise<GatewayPayment> {
    const response = await this.request<StripePaymentIntent>('GET', `/payment_intents/${encodeURIComponent(paymentIntentId)}`);
    return this.toPayment(response);
  }

  async capturePayment(paymentId: string, amountMinor: string): Promise<GatewayPayment> {
    const current = await this.fetchPayment(paymentId);
    if (current.status === 'CAPTURED') return current;

    const response = await this.request<StripePaymentIntent>(
      'POST',
      `/payment_intents/${encodeURIComponent(paymentId)}/capture`,
      { amount_to_capture: amountMinor },
    );
    return this.toPayment(response);
  }

  async refund(input: RefundInput): Promise<GatewayRefund> {
    const body: Record<string, string> = { payment_intent: input.paymentId };
    if (input.amountMinor) body.amount = input.amountMinor;
    if (input.reason) body['metadata[reason]'] = input.reason;

    const response = await this.request<{ id: string; payment_intent: string; amount: number; status: string }>(
      'POST',
      '/refunds',
      body,
      input.idempotencyKey,
    );

    return {
      refundId: response.id,
      paymentId: response.payment_intent,
      amountMinor: String(response.amount),
      status: response.status,
      raw: response as unknown as Record<string, unknown>,
    };
  }

  /**
   * Verifies `Stripe-Signature: t=<timestamp>,v1=<hmac>[,v0=...]`.
   *
   * The timestamp is folded into the signed payload (`${t}.${rawBody}`), and
   * a signature older than 5 minutes is rejected even if otherwise valid —
   * exactly the "±5 min timestamp window" the roadmap calls for, and Stripe's
   * own documented defence against a captured request being replayed later.
   */
  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookVerification> {
    const header = headers['stripe-signature'];
    const signatureHeader = Array.isArray(header) ? header[0] : header;

    if (!signatureHeader || !this.config.webhookSecret) {
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    const parts = Object.fromEntries(
      signatureHeader.split(',').map((part) => {
        const [key, value] = part.split('=');
        return [key, value] as [string, string];
      }),
    );
    const timestamp = parts['t'];
    const v1 = parts['v1'];
    if (!timestamp || !v1) {
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
      this.logger.warn(`Rejected a Stripe webhook outside the ${WEBHOOK_TOLERANCE_SECONDS}s tolerance window`);
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    const expected = createHmac('sha256', this.config.webhookSecret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    if (!safeEqualHex(expected, v1)) {
      this.logger.warn('Rejected a Stripe webhook with an invalid signature');
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
      event: typeof payload['type'] === 'string' ? payload['type'] : null,
      eventId: typeof payload['id'] === 'string' ? payload['id'] : null,
      payload,
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, string>,
    idempotencyKey?: string,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new ExternalServiceError('stripe', 'Stripe credentials are not configured');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.secretKey}`,
    };
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? new URLSearchParams(body).toString() : undefined,
        signal: controller.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        let message = text.slice(0, 300);
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string } };
          message = parsed.error?.message ?? message;
        } catch {
          /* keep the raw text */
        }
        throw new ExternalServiceError('stripe', message, { status: response.status, path });
      }

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError('stripe', 'Request timed out after 15s', { path });
      }
      throw new ExternalServiceError('stripe', error instanceof Error ? error.message : String(error), { path });
    } finally {
      clearTimeout(timeout);
    }
  }

  private toPayment(intent: StripePaymentIntent): GatewayPayment {
    return {
      paymentId: intent.id,
      orderId: intent.id,
      status: mapStatus(intent.status),
      amountMinor: String(intent.amount),
      currency: intent.currency.toUpperCase(),
      method: intent.payment_method_types?.[0] ?? null,
      failureCode: intent.last_payment_error?.code ?? null,
      failureMessage: intent.last_payment_error?.message ?? null,
      raw: intent as unknown as Record<string, unknown>,
    };
  }
}

function mapStatus(status: StripePaymentIntent['status']): GatewayPayment['status'] {
  switch (status) {
    case 'succeeded':
      return 'CAPTURED';
    case 'requires_capture':
      return 'AUTHORIZED';
    case 'canceled':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}
