import { Injectable, Logger } from '@nestjs/common';
import { ValidationError } from '@ems/kernel';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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

/** The stub's signing secret. Fixed, because it protects nothing real. */
const STUB_SECRET = 'stub-gateway-secret';

interface StubOrder {
  orderId: string;
  amountMinor: string;
  currency: string;
  reference: string;
  paymentId: string | null;
  status: 'created' | 'captured' | 'failed' | 'refunded';
}

/**
 * In-memory gateway for local development and tests.
 *
 * The point is that the **whole payment flow** — order creation, signature verification,
 * capture, webhook handling — can be exercised end-to-end without live Razorpay credentials
 * and without network access. Every CI run and every developer clone gets a working
 * checkout.
 *
 * It is a genuine implementation of the port, not a mock: it signs its callbacks with real
 * HMAC-SHA256 and verifies them in constant time, so the calling code exercises the same
 * verification path it will use against Razorpay. A stub that skipped verification would let
 * a signature bug ship undetected.
 *
 * Refuses to run in production — see `isConfigured`.
 */
@Injectable()
export class StubPaymentAdapter implements PaymentGatewayPort {
  readonly name = 'stub' as const;
  private readonly logger = new Logger(StubPaymentAdapter.name);

  /**
   * Orders live in process memory, so a restart forgets them.
   *
   * Acceptable — and deliberate — for a dev/test gateway: persisting fake payments would
   * mean migrations and cleanup for data that has no business meaning.
   */
  private readonly orders = new Map<string, StubOrder>();

  isConfigured(): boolean {
    // Hard refusal in production. If this ever loads there, a misconfigured
    // PAYMENT_GATEWAY_DEFAULT would silently mark real invoices paid without collecting
    // money — the worst possible failure mode for a billing system.
    return process.env.NODE_ENV !== 'production';
  }

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    this.assertNotProduction();

    const orderId = `stub_order_${randomBytes(8).toString('hex')}`;

    this.orders.set(orderId, {
      orderId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      reference: input.reference,
      paymentId: null,
      status: 'created',
    });

    return {
      orderId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'created',
      clientPayload: {
        gateway: 'stub',
        orderId,
        amount: Number(input.amountMinor),
        currency: input.currency,
        // Tests and the dev console call this to simulate the shopper paying.
        completeUrl: `/api/v1/webhooks/stub/complete?orderId=${orderId}`,
      },
    };
  }

  /**
   * Simulates a successful payment and returns a correctly-signed callback.
   *
   * Only the stub exposes this — it stands in for the shopper completing checkout in the
   * gateway's hosted UI.
   */
  simulatePayment(orderId: string, succeed = true): VerifyPaymentInput {
    this.assertNotProduction();

    const order = this.orders.get(orderId);
    if (!order) throw new ValidationError(`Unknown stub order: ${orderId}`);

    const paymentId = `stub_pay_${randomBytes(8).toString('hex')}`;
    order.paymentId = paymentId;
    order.status = succeed ? 'captured' : 'failed';

    return {
      orderId,
      paymentId,
      // Signed exactly as Razorpay signs: HMAC over `order_id|payment_id`.
      signature: createHmac('sha256', STUB_SECRET).update(`${orderId}|${paymentId}`).digest('hex'),
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<GatewayPayment> {
    this.assertNotProduction();

    const expected = createHmac('sha256', STUB_SECRET)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest('hex');

    // Real constant-time verification, so the caller's handling of a bad signature is
    // exercised rather than assumed.
    if (!safeEqualHex(expected, input.signature)) {
      throw new ValidationError('Stub signature verification failed');
    }

    return this.fetchPayment(input.paymentId);
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    this.assertNotProduction();

    const order = [...this.orders.values()].find((candidate) => candidate.paymentId === paymentId);
    if (!order) throw new ValidationError(`Unknown stub payment: ${paymentId}`);

    return {
      paymentId,
      orderId: order.orderId,
      status: order.status === 'captured' ? 'CAPTURED' : order.status === 'failed' ? 'FAILED' : 'PENDING',
      amountMinor: order.amountMinor,
      currency: order.currency,
      method: 'stub',
      failureCode: order.status === 'failed' ? 'STUB_DECLINED' : null,
      failureMessage: order.status === 'failed' ? 'Simulated decline' : null,
      raw: { gateway: 'stub', reference: order.reference },
    };
  }

  async capturePayment(paymentId: string): Promise<GatewayPayment> {
    // Auto-captured, like Razorpay's default flow — so callers do not develop against a
    // capture step that the real gateway will not need.
    return this.fetchPayment(paymentId);
  }

  async refund(input: RefundInput): Promise<GatewayRefund> {
    this.assertNotProduction();

    const order = [...this.orders.values()].find(
      (candidate) => candidate.paymentId === input.paymentId,
    );
    if (!order) throw new ValidationError(`Unknown stub payment: ${input.paymentId}`);

    order.status = 'refunded';

    return {
      refundId: `stub_rfnd_${randomBytes(8).toString('hex')}`,
      paymentId: input.paymentId,
      amountMinor: input.amountMinor ?? order.amountMinor,
      status: 'processed',
      raw: { gateway: 'stub' },
    };
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookVerification {
    this.assertNotProduction();

    const header = headers['x-stub-signature'];
    const signature = Array.isArray(header) ? header[0] : header;

    const expected = createHmac('sha256', STUB_SECRET).update(rawBody).digest('hex');
    if (!signature || !safeEqualHex(expected, signature)) {
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
      eventId: typeof payload['id'] === 'string' ? payload['id'] : null,
      payload,
    };
  }

  /** Signs a body as the stub gateway would — used by tests to post a valid webhook. */
  signWebhook(body: string): string {
    return createHmac('sha256', STUB_SECRET).update(body).digest('hex');
  }

  private assertNotProduction(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'StubPaymentAdapter was invoked in production. This would mark invoices paid ' +
          'without collecting money — check PAYMENT_GATEWAY_DEFAULT.',
      );
    }
  }
}

function safeEqualHex(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}
