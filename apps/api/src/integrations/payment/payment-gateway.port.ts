/**
 * The contract every payment gateway implements.
 *
 * Five gateways are in scope (Razorpay, Stripe, PayPal, Cashfree, PhonePe) and they differ
 * substantially: some capture automatically, some need an explicit capture; some return a
 * redirect URL, others a client token; their webhook signature schemes are all different.
 * The port exists so the subscription and order code depends on *intent* — "collect this
 * amount" — and never on any provider's vocabulary.
 *
 * Deliberately **not** modelled here: card details. Every method takes and returns
 * references only. A PAN must never enter our process, which is what keeps us SAQ-A
 * (docs/01 §8.4) rather than in full PCI-DSS scope.
 */

export type GatewayName = 'razorpay' | 'stripe' | 'paypal' | 'cashfree' | 'phonepe' | 'stub';

export interface CreateOrderInput {
  /** Minor units, as a string — never a float. */
  amountMinor: string;
  currency: string;
  /** Our own reference, echoed back by the gateway so a webhook can be matched to a row. */
  reference: string;
  description: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  /**
   * Passed to the gateway's own idempotency mechanism where one exists.
   *
   * Without it, a retried create-order call bills the customer twice — and a retry is
   * exactly what happens when a response is lost to a network blip.
   */
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface GatewayOrder {
  /** The gateway's order/intent id. */
  orderId: string;
  amountMinor: string;
  currency: string;
  status: string;
  /**
   * What the browser needs to open checkout.
   *
   * Shape varies per provider — a key + order id for Razorpay's modal, a redirect URL for
   * PayPal. Kept opaque so the console passes it straight through without interpreting it.
   */
  clientPayload: Record<string, unknown>;
}

export interface VerifyPaymentInput {
  orderId: string;
  paymentId: string;
  /** Provider signature over the ids, proving the callback came from the gateway. */
  signature: string;
}

export interface GatewayPayment {
  paymentId: string;
  orderId: string | null;
  status: 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'PENDING' | 'REFUNDED';
  amountMinor: string;
  currency: string;
  method: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  /** Provider response, already stripped of anything card-like by the adapter. */
  raw: Record<string, unknown>;
}

export interface RefundInput {
  paymentId: string;
  /** Omit for a full refund. */
  amountMinor?: string;
  reason?: string;
  idempotencyKey?: string;
}

export interface GatewayRefund {
  refundId: string;
  paymentId: string;
  amountMinor: string;
  status: string;
  raw: Record<string, unknown>;
}

export interface WebhookVerification {
  valid: boolean;
  /** Gateway's event name, e.g. `payment.captured`. */
  event: string | null;
  /** Provider event id, used for replay detection. */
  eventId: string | null;
  payload: Record<string, unknown>;
}

export interface PaymentGatewayPort {
  readonly name: GatewayName;

  /** True when credentials are configured. A gateway without keys must not be offered. */
  isConfigured(): boolean;

  createOrder(input: CreateOrderInput): Promise<GatewayOrder>;

  /**
   * Verifies a client-side callback.
   *
   * The browser reports success, so this **must** be checked server-side against the
   * gateway's signature. Trusting the client here is the single most common payment
   * integration flaw: a user can otherwise claim any order was paid.
   */
  verifyPayment(input: VerifyPaymentInput): Promise<GatewayPayment>;

  /** Authoritative status, read directly from the gateway. Used by reconciliation. */
  fetchPayment(paymentId: string): Promise<GatewayPayment>;

  /** Captures an authorised payment. A no-op on gateways that auto-capture. */
  capturePayment(paymentId: string, amountMinor: string, currency: string): Promise<GatewayPayment>;

  refund(input: RefundInput): Promise<GatewayRefund>;

  /**
   * Verifies an inbound webhook against the **raw** request body.
   *
   * Raw bytes, not the parsed object: a parse-and-reserialise round-trip changes key order
   * and whitespace, which invalidates the HMAC and makes every webhook look forged.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookVerification;
}

export const PAYMENT_GATEWAYS = 'PAYMENT_GATEWAYS';
