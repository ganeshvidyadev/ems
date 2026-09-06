import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
import { createHash, randomUUID } from 'node:crypto';
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

interface PhonePeStatusData {
  merchantTransactionId: string;
  transactionId?: string;
  amount: number;
  state: 'COMPLETED' | 'FAILED' | 'PENDING';
  responseCode?: string;
  paymentInstrument?: { type?: string };
}

interface PhonePeResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data?: T;
}

/**
 * PhonePe adapter (Standard Checkout PG API).
 *
 * PhonePe's whole request/response envelope is a base64-encoded JSON payload
 * rather than a plain JSON body, and every call is signed with
 * `X-VERIFY: SHA256(payload + path + saltKey)###saltIndex` — there is no
 * bearer token or basic auth at all, just this one checksum scheme reused for
 * requests, status polling, refunds and the inbound webhook alike.
 */
@Injectable()
export class PhonePeAdapter implements PaymentGatewayPort {
  readonly name = 'phonepe' as const;
  private readonly logger = new Logger(PhonePeAdapter.name);
  private readonly config: PaymentConfig['phonepe'];
  private readonly apiBase: string;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<PaymentConfig>('payment').phonepe;
    this.apiBase =
      this.config.env === 'PRODUCTION'
        ? 'https://api.phonepe.com/apis/hermes'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  }

  isConfigured(): boolean {
    return Boolean(this.config.merchantId && this.config.saltKey);
  }

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    const merchantTransactionId = input.reference.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 35);

    const payload = {
      merchantId: this.config.merchantId,
      merchantTransactionId,
      merchantUserId: `MU-${merchantTransactionId}`,
      amount: Number(input.amountMinor), // PhonePe's native unit is paise, same as ours
      redirectMode: 'POST',
      paymentInstrument: { type: 'PAY_PAGE' },
    };

    const response = await this.request<PhonePeResponse<{ instrumentResponse?: { redirectInfo?: { url?: string } } }>>(
      '/pg/v1/pay',
      payload,
    );

    return {
      orderId: merchantTransactionId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: response.success ? 'PENDING' : 'FAILED',
      clientPayload: {
        redirectUrl: response.data?.instrumentResponse?.redirectInfo?.url ?? null,
        merchantTransactionId,
      },
    };
  }

  /** No client-side signature for PhonePe's redirect flow — the status endpoint is authoritative. */
  async verifyPayment(input: VerifyPaymentInput): Promise<GatewayPayment> {
    return this.fetchPayment(input.orderId);
  }

  async fetchPayment(merchantTransactionId: string): Promise<GatewayPayment> {
    const path = `/pg/v1/status/${this.config.merchantId}/${merchantTransactionId}`;
    const response = await this.statusRequest(path);
    return this.toPayment(response.data);
  }

  /** PhonePe auto-captures; nothing left to do for a manual second step. */
  async capturePayment(paymentId: string): Promise<GatewayPayment> {
    return this.fetchPayment(paymentId);
  }

  async refund(input: RefundInput): Promise<GatewayRefund> {
    const refundTransactionId = (input.idempotencyKey ?? randomUUID()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 35);

    const payload = {
      merchantId: this.config.merchantId,
      merchantUserId: `MU-${refundTransactionId}`,
      originalTransactionId: input.paymentId,
      merchantTransactionId: refundTransactionId,
      amount: input.amountMinor ? Number(input.amountMinor) : undefined,
    };

    const response = await this.request<PhonePeResponse<{ merchantTransactionId: string; amount: number }>>(
      '/pg/v1/refund',
      payload,
    );

    return {
      refundId: response.data?.merchantTransactionId ?? refundTransactionId,
      paymentId: input.paymentId,
      amountMinor: String(response.data?.amount ?? input.amountMinor ?? '0'),
      status: response.success ? 'PENDING' : 'FAILED',
      raw: response as unknown as Record<string, unknown>,
    };
  }

  /**
   * Verifies the callback's own `X-VERIFY` header: `SHA256(base64Body + saltKey)###saltIndex`.
   * No timestamp is included in PhonePe's scheme, so there is no replay window to enforce here
   * the way Stripe's/Cashfree's signatures allow — PhonePe relies on the checksum alone.
   */
  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookVerification> {
    const header = headers['x-verify'];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature || !this.config.saltKey) {
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    const base64Response = typeof payload['response'] === 'string' ? payload['response'] : rawBody.toString('base64');
    const expected = this.checksum(base64Response);

    if (expected !== signature) {
      this.logger.warn('Rejected a PhonePe webhook with an invalid checksum');
      return { valid: false, event: null, eventId: null, payload: {} };
    }

    const decoded = JSON.parse(Buffer.from(base64Response, 'base64').toString('utf8')) as {
      code?: string;
      data?: { merchantTransactionId?: string };
    };

    return {
      valid: true,
      event: decoded.code ?? null,
      eventId: decoded.data?.merchantTransactionId ?? null,
      payload: decoded as Record<string, unknown>,
    };
  }

  // -------------------------------------------------------------------------
  // Signing + HTTP
  // -------------------------------------------------------------------------

  private checksum(input: string): string {
    return `${createHash('sha256').update(`${input}${this.config.saltKey}`).digest('hex')}###${this.config.saltIndex}`;
  }

  private async request<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    if (!this.isConfigured()) {
      throw new ExternalServiceError('phonepe', 'PhonePe credentials are not configured');
    }

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const xVerify = this.checksum(`${base64Payload}${path}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${this.apiBase}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
        },
        body: JSON.stringify({ request: base64Payload }),
        signal: controller.signal,
      });

      const text = await response.text();
      const parsed = JSON.parse(text) as PhonePeResponse<unknown> & { message?: string };

      if (!response.ok || parsed.success === false) {
        throw new ExternalServiceError('phonepe', parsed.message ?? 'PhonePe request failed', {
          status: response.status,
          code: parsed.code,
          path,
        });
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError('phonepe', 'Request timed out after 15s', { path });
      }
      throw new ExternalServiceError('phonepe', error instanceof Error ? error.message : String(error), { path });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async statusRequest(path: string): Promise<PhonePeResponse<PhonePeStatusData>> {
    if (!this.isConfigured()) {
      throw new ExternalServiceError('phonepe', 'PhonePe credentials are not configured');
    }

    const xVerify = this.checksum(path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${this.apiBase}${path}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-MERCHANT-ID': this.config.merchantId,
        },
        signal: controller.signal,
      });

      const text = await response.text();
      const parsed = JSON.parse(text) as PhonePeResponse<PhonePeStatusData>;

      if (!response.ok) {
        throw new ExternalServiceError('phonepe', parsed.message ?? 'PhonePe status check failed', {
          status: response.status,
          path,
        });
      }

      return parsed;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError('phonepe', 'Request timed out after 15s', { path });
      }
      throw new ExternalServiceError('phonepe', error instanceof Error ? error.message : String(error), { path });
    } finally {
      clearTimeout(timeout);
    }
  }

  private toPayment(data: PhonePeStatusData | undefined): GatewayPayment {
    if (!data) {
      return {
        paymentId: '',
        orderId: null,
        status: 'PENDING',
        amountMinor: '0',
        currency: 'INR',
        method: null,
        failureCode: null,
        failureMessage: null,
        raw: {},
      };
    }

    return {
      paymentId: data.transactionId ?? data.merchantTransactionId,
      orderId: data.merchantTransactionId,
      status: mapStatus(data.state),
      amountMinor: String(data.amount),
      currency: 'INR',
      method: data.paymentInstrument?.type ?? null,
      failureCode: data.state === 'FAILED' ? (data.responseCode ?? 'FAILED') : null,
      failureMessage: data.state === 'FAILED' ? 'Payment failed at PhonePe' : null,
      raw: data as unknown as Record<string, unknown>,
    };
  }
}

function mapStatus(state: PhonePeStatusData['state']): GatewayPayment['status'] {
  switch (state) {
    case 'COMPLETED':
      return 'CAPTURED';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}
