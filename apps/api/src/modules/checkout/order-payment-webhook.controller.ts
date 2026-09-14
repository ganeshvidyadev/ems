import { BadRequestException, Controller, HttpCode, HttpStatus, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
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
 * replay-protection as the subscription-billing
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
  ) {}

  @Public()
  @Post('order-payments/:gateway')
  @HttpCode(HttpStatus.OK)
  async handle(@Req() request: RawBodyRequest): Promise<{ received: boolean }> {
    const gatewayName = request.params['gateway'] as GatewayName;
    const rawBody = request.rawBody;
    if (!rawBody) throw new BadRequestException('Raw webhook body is required');

    let adapter;
    try {
      adapter = this.gateways.resolve(gatewayName);
    } catch {
      this.logger.warn(`Order-payment webhook for unknown gateway '${gatewayName}'`);
      throw new BadRequestException('Unsupported payment gateway');
    }

    const verification: WebhookVerification = await adapter.verifyWebhook(
      rawBody,
      request.headers as Record<string, string | string[] | undefined>,
    );

    this.logBuffer.enqueue('webhook_logs', {
      direction: 'IN',
      provider: gatewayName,
      event: verification.event,
      signatureValid: verification.valid,
      statusCode: 200,
      // Provider bodies can contain contact details or tokens; retain metadata only.
      eventId: verification.eventId,
      createdAt: new Date(),
    });

    if (!verification.valid) {
      this.logger.warn(`Rejected an unverified order-payment ${gatewayName} webhook`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Let failures return non-2xx so the provider retries. The event marker is
    // committed in the same transaction as settlement, never before processing.
    await this.process(gatewayName, verification);

    return { received: true };
  }

  private async process(gatewayName: GatewayName, verification: WebhookVerification): Promise<void> {
    const event = verification.event ?? '';
    if (!/^payment\.(captured|authorized|failed)$/.test(event)) return;

    const entity = extractPaymentEntity(verification.payload);
    if (!entity?.id) throw new BadRequestException('Payment event is missing a payment reference');

    const adapter = this.gateways.resolve(gatewayName);
    // The payload's amount/status are never trusted — see the subscription
    // webhook controller's identical comment.
    const authoritative = await adapter.fetchPayment(entity.id);

    // Some adapters fall back to the payment ID as event ID. Include event type
    // so an authorization does not suppress the later capture for that payment.
    await this.checkout.settleWebhook(gatewayName, authoritative,
      verification.eventId ? `${event}:${verification.eventId}` : null);
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
