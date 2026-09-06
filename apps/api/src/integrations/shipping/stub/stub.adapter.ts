import { Injectable, Logger } from '@nestjs/common';
import { ValidationError } from '@ems/kernel';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  CarrierShipment,
  CarrierWebhookVerification,
  CreateShipmentInput,
  LabelResult,
  ManifestResult,
  PickupRequestInput,
  PickupResult,
  RateResult,
  ServiceabilityInput,
  ServiceabilityResult,
  ShippingCarrierPort,
  TrackingEvent,
  TrackingResult,
  TrackingStatus,
} from '../shipping-carrier.port';

const STUB_SECRET = 'stub-carrier-secret';

/** Pincodes ending in these digits are deliberately unserviceable, so the checkout path is exercisable in tests. */
const UNSERVICEABLE_SUFFIXES = ['0000'];

interface StubShipment {
  awbNumber: string;
  carrierShipmentId: string;
  status: TrackingStatus;
  events: TrackingEvent[];
}

/**
 * In-memory carrier for local development and tests — the shipping-side twin
 * of `StubPaymentAdapter`, and for the same reason: the whole fulfilment
 * flow (serviceability, rate quote, AWB generation, pickup, manifest,
 * tracking, RTO) needs to be exercisable end-to-end with no live carrier
 * account and no network access.
 *
 * A genuine implementation of the port, not a mock: it HMAC-signs its own
 * webhook payloads and verifies them in constant time, so calling code
 * exercises the same verification path it will use against a real carrier.
 */
@Injectable()
export class StubShippingAdapter implements ShippingCarrierPort {
  readonly name = 'stub' as const;
  private readonly logger = new Logger(StubShippingAdapter.name);
  private readonly shipments = new Map<string, StubShipment>();

  isConfigured(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  async checkServiceability(input: ServiceabilityInput): Promise<ServiceabilityResult> {
    this.assertNotProduction();
    const unserviceable = UNSERVICEABLE_SUFFIXES.some((suffix) => input.destinationPincode.endsWith(suffix));
    if (unserviceable) {
      return { serviceable: false, reason: `Pincode ${input.destinationPincode} is not serviceable` };
    }
    return { serviceable: true, estimatedDays: input.isCod ? 5 : 3 };
  }

  async getRates(input: ServiceabilityInput): Promise<RateResult[]> {
    this.assertNotProduction();
    const serviceability = await this.checkServiceability(input);
    if (!serviceability.serviceable) return [];

    const base = 4000 + Math.ceil(input.weightGrams / 500) * 500;
    return [
      { carrier: 'stub', serviceType: 'STANDARD', rateMinor: String(base), currency: 'INR', estimatedDays: 4 },
      {
        carrier: 'stub',
        serviceType: 'EXPRESS',
        rateMinor: String(base + 5000),
        currency: 'INR',
        estimatedDays: 1,
      },
    ];
  }

  async createShipment(input: CreateShipmentInput): Promise<CarrierShipment> {
    this.assertNotProduction();

    const awbNumber = `STUB${randomBytes(6).toString('hex').toUpperCase()}`;
    const carrierShipmentId = `stub_shp_${randomBytes(6).toString('hex')}`;

    this.shipments.set(awbNumber, {
      awbNumber,
      carrierShipmentId,
      status: 'LABEL_CREATED',
      events: [this.event('LABEL_CREATED', 'Label created')],
    });

    return {
      carrierShipmentId,
      awbNumber,
      trackingUrl: `https://stub-carrier.test/track/${awbNumber}`,
      raw: { reference: input.reference, orderReference: input.orderReference },
    };
  }

  async cancelShipment(awbNumber: string): Promise<void> {
    this.assertNotProduction();
    const shipment = this.mustFind(awbNumber);
    shipment.status = 'CANCELLED';
    shipment.events.push(this.event('CANCELLED', 'Shipment cancelled'));
  }

  async schedulePickup(input: PickupRequestInput): Promise<PickupResult> {
    this.assertNotProduction();
    for (const awb of input.awbNumbers) {
      const shipment = this.mustFind(awb);
      shipment.status = 'PICKUP_SCHEDULED';
      shipment.events.push(this.event('PICKUP_SCHEDULED', `Pickup scheduled for ${input.pickupDate}`));
    }
    return { pickupId: `stub_pickup_${randomBytes(4).toString('hex')}`, scheduledDate: input.pickupDate, raw: {} };
  }

  async generateManifest(awbNumbers: string[]): Promise<ManifestResult> {
    this.assertNotProduction();
    return {
      manifestUrl: `https://stub-carrier.test/manifest/${randomBytes(4).toString('hex')}`,
      raw: { awbNumbers },
    };
  }

  async generateLabel(awbNumber: string): Promise<LabelResult> {
    this.assertNotProduction();
    this.mustFind(awbNumber);
    return { labelUrl: `https://stub-carrier.test/label/${awbNumber}.pdf`, raw: {} };
  }

  async track(awbNumber: string): Promise<TrackingResult> {
    this.assertNotProduction();
    const shipment = this.mustFind(awbNumber);
    return { awbNumber, currentStatus: shipment.status, events: shipment.events };
  }

  async initiateRto(awbNumber: string, reason: string): Promise<void> {
    this.assertNotProduction();
    const shipment = this.mustFind(awbNumber);
    shipment.status = 'RTO_INITIATED';
    shipment.events.push(this.event('RTO_INITIATED', `RTO initiated: ${reason}`));
  }

  /** Advances a shipment to the next natural state — the dev console's "simulate" button. */
  advance(awbNumber: string, status: TrackingStatus, description: string): void {
    this.assertNotProduction();
    const shipment = this.mustFind(awbNumber);
    shipment.status = status;
    shipment.events.push(this.event(status, description));
  }

  /** Correctly-signed webhook payload for the given AWB — used by tests. */
  buildWebhookPayload(awbNumber: string, status: TrackingStatus): { body: string; signature: string } {
    this.assertNotProduction();
    const body = JSON.stringify({ awb: awbNumber, status, timestamp: new Date().toISOString() });
    const signature = createHmac('sha256', STUB_SECRET).update(body).digest('hex');
    return { body, signature };
  }

  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<CarrierWebhookVerification> {
    this.assertNotProduction();

    const header = headers['x-stub-carrier-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    const expected = createHmac('sha256', STUB_SECRET).update(rawBody).digest('hex');

    if (!signature || !safeEqualHex(expected, signature)) {
      return { valid: false, awbNumber: null, payload: {} };
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      return { valid: false, awbNumber: null, payload: {} };
    }

    return {
      valid: true,
      awbNumber: typeof payload['awb'] === 'string' ? payload['awb'] : null,
      payload,
    };
  }

  private mustFind(awbNumber: string): StubShipment {
    const shipment = this.shipments.get(awbNumber);
    if (!shipment) throw new ValidationError(`Unknown stub shipment: ${awbNumber}`);
    return shipment;
  }

  private event(status: TrackingStatus, description: string): TrackingEvent {
    const eventAt = new Date();
    return {
      status,
      carrierStatusCode: status,
      description,
      location: null,
      eventAt,
      eventHash: createHash('sha256').update(`${status}:${eventAt.getTime()}`).digest('hex'),
    };
  }

  private assertNotProduction(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'StubShippingAdapter was invoked in production. This would report fake shipments ' +
          'as dispatched without a real carrier ever handling them — check SHIPPING_CARRIER_DEFAULT.',
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
