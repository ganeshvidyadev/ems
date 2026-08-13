import { Controller, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators';
import { PaymentGatewayFactory } from '../../integrations/payment/payment-gateway.factory';
import type { GatewayName, WebhookVerification } from '../../integrations/payment/payment-gateway.port';
import { LogBufferService } from '../logging/log-buffer.service';
import { PaymentService } from './payment.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Inbound payment webhooks.
 *
 * `@Public()` because a gateway cannot present one of our tokens. Authentication is the HMAC
 * signature instead — which is why every branch below refuses to act on an unverified body.
 *
 * Three properties matter here, and all three are easy to get wrong:
 *
 *  1. **Raw bytes.** The signature covers the exact body the gateway sent. A
 *     parse-and-reserialise round-trip reorders keys and normalises whitespace, which breaks
 *     the HMAC and makes every legitimate webhook look forged.
 *
 *  2. **Replay protection.** A captured webhook can be resent indefinitely. Each event id is
 *     recorded in `processed_events`; a duplicate is acknowledged and dropped rather than
 *     credited twice.
 *
 *  3. **Always 200 once verified.** A 5xx makes the gateway redeliver on a backoff for hours.
 *     After the signature checks out we take responsibility for the event, record what
 *     happened, and answer 200 — even if our own processing failed, because reconciliation
 *     will pick that up and endless redelivery will not.
 */
@Controller({ path: 'webhooks', version: '1' })
@ApiExcludeController()
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly gateways: PaymentGatewayFactory,
    private readonly payments: PaymentService,
    private readonly logBuffer: LogBufferService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Public()
  @Post('payments/:gateway')
  @HttpCode(HttpStatus.OK)
  async handle(@Req() request: RawBodyRequest): Promise<{ received: boolean }> {
    const gatewayName = request.params['gateway'] as GatewayName;
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');

    let adapter;
    try {
      adapter = this.gateways.resolve(gatewayName);
    } catch {
      // Unknown or unconfigured gateway. 200 so an accidentally-pointed webhook does not
      // retry forever, but nothing is processed.
      this.logger.warn(`Webhook for unknown gateway '${gatewayName}'`);
      return { received: true };
    }

    const verification: WebhookVerification = adapter.verifyWebhook(
      rawBody,
      request.headers as Record<string, string | string[] | undefined>,
    );

    this.logBuffer.enqueue('webhook_logs', {
      direction: 'IN',
      provider: gatewayName,
      event: verification.event,
      signatureValid: verification.valid,
      statusCode: 200,
      // Payload retained only when verified. Logging an unverified body would let anyone
      // write arbitrary content into our log store.
      payload: verification.valid ? verification.payload : null,
      createdAt: new Date(),
    });

    if (!verification.valid) {
      // Deliberately still 200. A 401 tells a prober that their signature was wrong and
      // invites tuning; silence gives them nothing.
      this.logger.warn(`Rejected an unverified ${gatewayName} webhook`);
      return { received: true };
    }

    const eventId = verification.eventId;

    // Replay check. `processed_events` has a composite PK, so the insert below is the
    // deduplication — no read-then-write race.
    if (eventId) {
      const consumer = `webhook:${gatewayName}`;
      const claimed = await this.claimEvent(consumer, eventId);

      if (!claimed) {
        this.logger.debug(`Ignoring replayed ${gatewayName} event ${eventId}`);
        return { received: true };
      }
    }

    try {
      await this.process(gatewayName, verification);
    } catch (error) {
      // Recorded, not rethrown — see property (3). Reconciliation will re-check this payment
      // against the gateway, which is a more reliable recovery than hoping a redelivery
      // succeeds.
      this.logger.error(
        `Failed to process ${gatewayName} webhook ${eventId ?? '(no id)'}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }

    return { received: true };
  }

  /**
   * Records the event id, returning false if it was already seen.
   *
   * `INSERT` and catch the duplicate-key error rather than `SELECT` then `INSERT`: two
   * concurrent redeliveries would both pass a read check and both process.
   */
  private async claimEvent(consumer: string, eventId: string): Promise<boolean> {
    try {
      await this.dataSource.query(
        `INSERT INTO processed_events (consumer_name, event_id, result) VALUES (?, ?, 'OK')`,
        [consumer, eventId],
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate/i.test(message)) return false;
      throw error;
    }
  }

  private async process(
    gatewayName: GatewayName,
    verification: WebhookVerification,
  ): Promise<void> {
    const event = verification.event ?? '';

    // Only payment-outcome events are acted on. Everything else is acknowledged and
    // ignored — a gateway sends dozens of event types we have no interest in.
    if (!/payment\.(captured|authorized|failed)/.test(event)) return;

    const entity = extractPaymentEntity(verification.payload);
    if (!entity?.id) return;

    const adapter = this.gateways.resolve(gatewayName);

    /*
     * The payload is NOT trusted for the amount or status.
     *
     * The signature proves the message came from the gateway, but reading the outcome from
     * the API is what guards against acting on a stale or partial event — and against a
     * replay of an older, superseded state.
     */
    const authoritative = await adapter.fetchPayment(entity.id);

    await this.payments.settle(
      gatewayName,
      authoritative.paymentId,
      authoritative.orderId ?? entity.order_id ?? null,
      authoritative,
    );
  }
}

function extractPaymentEntity(
  payload: Record<string, unknown>,
): { id?: string; order_id?: string | null } | null {
  const container = payload['payload'] as Record<string, unknown> | undefined;
  const wrapper = container?.['payment'] as { entity?: Record<string, unknown> } | undefined;
  const entity = wrapper?.entity;

  if (!entity) return null;

  return {
    id: typeof entity['id'] === 'string' ? entity['id'] : undefined,
    order_id: typeof entity['order_id'] === 'string' ? entity['order_id'] : null,
  };
}
