import { Controller, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators';
import { ShippingCarrierFactory } from '../../integrations/shipping/shipping-carrier.factory';
import type { CarrierName } from '../../integrations/shipping/shipping-carrier.port';
import { ShipmentTrackingService } from './shipment-tracking.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Inbound carrier tracking webhooks — the shipping-side twin of the payment
 * webhook controllers, down to replay protection via `processed_events` and
 * always answering 200 once the signature checks out (a 5xx just earns
 * redelivery on a backoff for hours; recording what happened and moving on
 * is more reliable than hoping a retry succeeds).
 */
@Controller({ path: 'webhooks', version: '1' })
@ApiExcludeController()
export class ShipmentWebhookController {
  private readonly logger = new Logger(ShipmentWebhookController.name);

  constructor(
    private readonly shippingCarriers: ShippingCarrierFactory,
    private readonly tracking: ShipmentTrackingService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Public()
  @Post('shipping/:carrier')
  @HttpCode(HttpStatus.OK)
  async handle(@Req() request: RawBodyRequest): Promise<{ received: boolean }> {
    const carrierName = request.params['carrier'] as CarrierName;
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');

    let adapter;
    try {
      adapter = this.shippingCarriers.resolve(carrierName);
    } catch {
      this.logger.warn(`Shipping webhook for unknown carrier '${carrierName}'`);
      return { received: true };
    }

    const verification = await adapter.verifyWebhook(
      rawBody,
      request.headers as Record<string, string | string[] | undefined>,
    );

    if (!verification.valid || !verification.awbNumber) {
      this.logger.warn(`Rejected an unverified ${carrierName} tracking webhook`);
      return { received: true };
    }

    // Replay key is the AWB plus a hash of the raw body — carriers have no
    // stable per-event id the way payment gateways do, so the same scan
    // resent twice must hash identically to be recognised as a duplicate.
    const eventKey = `${verification.awbNumber}:${hashBody(rawBody)}`;
    const claimed = await this.claimEvent(`shipment-webhook:${carrierName}`, eventKey);
    if (!claimed) {
      this.logger.debug(`Ignoring replayed ${carrierName} tracking webhook for ${verification.awbNumber}`);
      return { received: true };
    }

    try {
      await this.tracking.syncFromWebhook(verification.awbNumber);
    } catch (error) {
      this.logger.error(
        `Failed to process ${carrierName} tracking webhook for ${verification.awbNumber}: ` +
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
}

function hashBody(rawBody: Buffer): string {
  return createHash('sha256').update(rawBody).digest('hex').slice(0, 16);
}
