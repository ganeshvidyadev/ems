import { Controller, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators';
import { PaymentGatewayFactory } from '../../integrations/payment/payment-gateway.factory';
import type { GatewayName, WebhookVerification } from '../../integrations/payment/payment-gateway.port';
import { LogBufferService } from '../logging/log-buffer.service';
import { CheckoutService } from './checkout.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Inbound payment webhooks for order checkouts — the same verification,
 * replay-protection and always-200 discipline as the subscription-billing
 * webhook at `POST /webhooks/payments/:gateway` (see that controller's own
 * doc comment), on a **separate URL** so the two never have to guess which
 * table an event belongs to. A real deployment gives each gateway its own
 * webhook secret per concern anyway, so two URLs is the natural shape, not a
 * workaround.
 */
@Controller({ path: 'webhooks', version: '1' })
@ApiExcludeController()
export class OrderPaymentWebhookController {
  private readonly logger = new Logger(OrderPaymentWebhookController.name);

  constructor(
    private readonly gateways: PaymentGatewayFactory,
    private readonly checkout: CheckoutService,
    private readonly logBuffer: LogBufferService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Public()
  @Post('order-payments/:gateway')
  @HttpCode(HttpStatus.OK)
  async handle(@Req() request: RawBodyRequest): Promise<{ received: boolean }> {
    const gatewayName = request.params['gateway'] as GatewayName;
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');

    let adapter;
    try {
      adapter = this.gateways.resolve(gatewayName);
    } catch {
      this.logger.warn(`Order-payment webhook for unknown gateway '${gatewayName}'`);
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
      payload: verification.valid ? verification.payload : null,
      createdAt: new Date(),
    });

    if (!verification.valid) {
      this.logger.warn(`Rejected an unverified order-payment ${gatewayName} webhook`);
      return { received: true };
    }

    const eventId = verification.eventId;
    if (eventId) {
      const claimed = await this.claimEvent(`order-webhook:${gatewayName}`, eventId);
      if (!claimed) {
        this.logger.debug(`Ignoring replayed order-payment ${gatewayName} event ${eventId}`);
        return { received: true };
      }
    }

    try {
      await this.process(gatewayName, verification);
    } catch (error) {
      this.logger.error(
        `Failed to process order-payment ${gatewayName} webhook ${eventId ?? '(no id)'}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }

    return { received: true };
  }

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

  private async process(gatewayName: GatewayName, verification: WebhookVerification): Promise<void> {
    const event = verification.event ?? '';
    if (!/payment\.(captured|authorized|failed)/.test(event)) return;

    const entity = extractPaymentEntity(verification.payload);
    if (!entity?.id) return;

    const adapter = this.gateways.resolve(gatewayName);
    // The payload's amount/status are never trusted — see the subscription
    // webhook controller's identical comment.
    const authoritative = await adapter.fetchPayment(entity.id);

    await this.checkout.settleAndConfirm(
      gatewayName,
      authoritative.orderId ?? entity.order_id ?? null,
      authoritative.paymentId,
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
