import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
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

interface PayPalOrder {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links?: { rel: string; href: string }[];
  purchase_units?: {
    amount?: { currency_code: string; value: string };
    payments?: {
      captures?: {
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
      }[];
    };
  }[];
}

/**
 * PayPal adapter (Orders API v2).
 *
 * Two things set PayPal apart from the other gateways here:
 *
 *  1. **Major-unit amounts.** PayPal's API takes `"10.00"`, not minor units —
 *     the one gateway where our `Money` value object's major/minor split is
 *     actually exercised on the wire, not just internally.
 *  2. **Webhook verification is a network call.** PayPal has no local HMAC
 *     scheme; `verify-webhook-signature` is the only way to know a webhook is
 *     real, which is exactly why `PaymentGatewayPort.verifyWebhook` is async.
 */
@Injectable()
export class PayPalAdapter implements PaymentGatewayPort {
  readonly name = 'paypal' as const;
  private readonly logger = new Logger(PayPalAdapter.name);
  private readonly config: PaymentConfig['paypal'];
  private readonly apiBase: string;

  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<PaymentConfig>('payment').paypal;
    this.apiBase =
      this.config.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    const money = this.kernelMoney(input.amountMinor, input.currency);

    const response = await this.request<PayPalOrder>(
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: input.reference,
            description: input.description,
            amount: { currency_code: input.currency, value: money },
          },
        ],
      },
      input.idempotencyKey,
    );

    return {
      orderId: response.id,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: response.status,
      clientPayload: {
        orderId: response.id,
        approveUrl: response.links?.find((l) => l.rel === 'approve')?.href ?? null,
      },
    };
  }

  /**
   * Captures the order the buyer just approved. There is no separate
   * "verify a signature" step for PayPal's redirect flow — the capture call
   * itself is the authoritative confirmation (docs/01 §9: the gateway's API
   * decides, never the client).
   */
  async verifyPayment(input: VerifyPaymentInput): Promise<GatewayPayment> {
    try {
      const response = await this.request<PayPalOrder>(
        'POST',
        `/v2/checkout/orders/${encodeURIComponent(input.orderId)}/capture`,
        {},
      );
      return this.toPayment(response);
    } catch (error) {
      // Retried capture on an already-captured order — PayPal rejects the
      // second call, so this is not a failure, it is the idempotent case.
      if (error instanceof ExternalServiceError && /ORDER_ALREADY_CAPTURED/i.test(error.message)) {
        return this.fetchPayment(input.orderId);
      }
      throw error;
    }
  }

  async fetchPayment(orderId: string): Promise<GatewayPayment> {
    const response = await this.request<PayPalOrder>('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    return this.toPayment(response);
  }

  /** PayPal captures at approval time; nothing left to do for a manual second step. */
  async capturePayment(paymentId: string): Promise<GatewayPayment> {
    return this.fetchPayment(paymentId);
  }

  async refund(input: RefundInput): Promise<GatewayRefund> {
    // `input.paymentId` here is the **capture** id (see `toPayment` — we surface the capture
    // id as the payment id precisely so a refund has the right id to act on).
    const body: Record<string, unknown> = {};
    if (input.amountMinor) {
      body.amount = { currency_code: 'INR', value: this.kernelMoney(input.amountMinor, 'INR') };
    }
    if (input.reason) body.note_to_payer = input.reason.slice(0, 255);

    const response = await this.request<{ id: string; status: string }>(
      'POST',
      `/v2/payments/captures/${encodeURIComponent(input.paymentId)}/refund`,
      body,
      input.idempotencyKey,
    );

    return {
      refundId: response.id,
      paymentId: input.paymentId,
      amountMinor: input.amountMinor ?? '0',
      status: response.status,
      raw: response as unknown as Record<string, unknown>,
    };
  }

  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookVerification> {
    if (!this.config.webhookId) {
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    const header = (name: string): string | undefined => {
      const value = headers[name];
      return Array.isArray(value) ? value[0] : value;
    };

    try {
      const verification = await this.request<{ verification_status: 'SUCCESS' | 'FAILURE' }>(
        'POST',
        '/v1/notifications/verify-webhook-signature',
        {
          auth_algo: header('paypal-auth-algo'),
          cert_url: header('paypal-cert-url'),
          transmission_id: header('paypal-transmission-id'),
          transmission_sig: header('paypal-transmission-sig'),
          transmission_time: header('paypal-transmission-time'),
          webhook_id: this.config.webhookId,
          webhook_event: payload,
        },
      );

      if (verification.verification_status !== 'SUCCESS') {
        this.logger.warn('Rejected a PayPal webhook that failed verify-webhook-signature');
        return { valid: false, event: null, eventId: null, payload: {} };
      }
    } catch (error) {
      this.logger.error(
        `PayPal webhook verification call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    return {
      valid: true,
      event: typeof payload['event_type'] === 'string' ? payload['event_type'] : null,
      eventId: typeof payload['id'] === 'string' ? payload['id'] : null,
      payload,
    };
  }

  // -------------------------------------------------------------------------
  // Auth + HTTP
  // -------------------------------------------------------------------------

  private async accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 30_000) {
      return this.cachedToken.value;
    }

    const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const response = await fetch(`${this.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new ExternalServiceError('paypal', 'Failed to obtain an OAuth2 access token', {
        status: response.status,
      });
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new ExternalServiceError('paypal', 'PayPal credentials are not configured');
    }

    const token = await this.accessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    // PayPal's idempotency header for order creation and refunds.
    if (idempotencyKey) headers['PayPal-Request-Id'] = idempotencyKey;

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
          const parsed = JSON.parse(text) as { message?: string; details?: { issue?: string }[] };
          message = parsed.details?.[0]?.issue ?? parsed.message ?? message;
        } catch {
          /* keep the raw text */
        }
        throw new ExternalServiceError('paypal', message, { status: response.status, path });
      }

      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError('paypal', 'Request timed out after 15s', { path });
      }
      throw new ExternalServiceError('paypal', error instanceof Error ? error.message : String(error), { path });
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Minor units → PayPal's major-unit decimal string, e.g. `"150000"` paise → `"1500.00"`. */
  private kernelMoney(amountMinor: string, currency: string): string {
    // INR/USD/etc. all use 2 decimal places in our supported set; a genuine
    // zero-decimal currency (JPY) would need per-currency exponent handling,
    // which docs/02's `currencyMeta` already carries — not duplicated here
    // since only 2-decimal currencies are in scope today.
    void currency;
    const negative = amountMinor.startsWith('-');
    const digits = negative ? amountMinor.slice(1) : amountMinor;
    const padded = digits.padStart(3, '0');
    const value = `${padded.slice(0, -2)}.${padded.slice(-2)}`;
    return negative ? `-${value}` : value;
  }

  private toPayment(order: PayPalOrder): GatewayPayment {
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    const amount = capture?.amount ?? order.purchase_units?.[0]?.amount;

    return {
      // The capture id, not the order id — refunds act on captures, so this is the id that
      // has to survive into `payments.gateway_payment_id` for a later refund to work.
      paymentId: capture?.id ?? order.id,
      orderId: order.id,
      status: mapStatus(order.status, capture?.status),
      amountMinor: amount ? this.toMinorUnits(amount.value) : '0',
      currency: amount?.currency_code ?? 'INR',
      method: 'paypal',
      failureCode: null,
      failureMessage: null,
      raw: order as unknown as Record<string, unknown>,
    };
  }

  private toMinorUnits(major: string): string {
    const [whole, fraction = ''] = major.split('.');
    const paddedFraction = fraction.padEnd(2, '0').slice(0, 2);
    return `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, '');
  }
}

function mapStatus(orderStatus: PayPalOrder['status'], captureStatus?: string): GatewayPayment['status'] {
  if (captureStatus === 'COMPLETED' || orderStatus === 'COMPLETED') return 'CAPTURED';
  if (captureStatus === 'DECLINED' || orderStatus === 'VOIDED') return 'FAILED';
  if (orderStatus === 'APPROVED') return 'AUTHORIZED';
  return 'PENDING';
}
