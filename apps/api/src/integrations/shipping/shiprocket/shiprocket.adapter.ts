import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { ShippingConfig } from '../../../config/configuration';
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

const API_BASE = 'https://apiv2.shiprocket.in/v1/external';
/** Shiprocket's own tokens are valid ~10 days; refreshed well before that. */
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

interface ServiceabilityResponse {
  data?: {
    available_courier_companies?: {
      courier_company_id: number;
      courier_name: string;
      rate: number;
      etd?: string;
    }[];
  };
}

interface CreateOrderResponse {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
}

interface AssignAwbResponse {
  response?: {
    data?: { awb_code?: string; courier_company_id?: number; courier_name?: string };
  };
}

interface TrackingResponse {
  tracking_data?: {
    shipment_track?: { current_status?: string }[];
    shipment_track_activities?: { date: string; status: string; activity: string; location?: string }[];
  };
}

/**
 * Shiprocket adapter — the one carrier proven all the way through
 * (serviceability → rate → AWB → pickup → manifest → label → tracking →
 * cancel), for the same reason Razorpay was Phase 3's one payment gateway:
 * chosen for market fit (widely used by Indian D2C merchants, and itself an
 * aggregator over Delhivery/Blue Dart/DTDC/XpressBees and others, so a single
 * integration already reaches most of the roadmap's named carriers in
 * practice) and because proving the port once, completely, is worth more
 * than five superficial ones.
 *
 * **Honest gap:** Shiprocket's RTO is carrier-automatic after failed delivery
 * attempts, not a documented manual-trigger endpoint — `initiateRto` here
 * logs the request and updates our own records rather than fabricating a
 * carrier call that would not do what its name implies.
 */
@Injectable()
export class ShiprocketAdapter implements ShippingCarrierPort {
  readonly name = 'shiprocket' as const;
  private readonly logger = new Logger(ShiprocketAdapter.name);
  private readonly config: ShippingConfig['shiprocket'];

  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<ShippingConfig>('shipping').shiprocket;
  }

  isConfigured(): boolean {
    return Boolean(this.config.email && this.config.password);
  }

  async checkServiceability(input: ServiceabilityInput): Promise<ServiceabilityResult> {
    const response = await this.request<ServiceabilityResponse>(
      'GET',
      `/courier/serviceability/?pickup_postcode=${input.originPincode}&delivery_postcode=${input.destinationPincode}` +
        `&weight=${(input.weightGrams / 1000).toFixed(2)}&cod=${input.isCod ? 1 : 0}`,
    );

    const companies = response.data?.available_courier_companies ?? [];
    if (companies.length === 0) {
      return { serviceable: false, reason: `No courier serves ${input.destinationPincode} for this shipment` };
    }

    const fastest = companies.reduce((best, c) => (Number(c.etd) < Number(best.etd) ? c : best), companies[0]!);
    return { serviceable: true, estimatedDays: fastest.etd ? Number(fastest.etd) : undefined };
  }

  async getRates(input: ServiceabilityInput): Promise<RateResult[]> {
    const response = await this.request<ServiceabilityResponse>(
      'GET',
      `/courier/serviceability/?pickup_postcode=${input.originPincode}&delivery_postcode=${input.destinationPincode}` +
        `&weight=${(input.weightGrams / 1000).toFixed(2)}&cod=${input.isCod ? 1 : 0}`,
    );

    return (response.data?.available_courier_companies ?? []).map((company) => ({
      carrier: 'shiprocket',
      serviceType: company.courier_name,
      // Shiprocket quotes rupees; our own convention is always minor units.
      rateMinor: String(Math.round(company.rate * 100)),
      currency: 'INR',
      estimatedDays: company.etd ? Number(company.etd) : undefined,
    }));
  }

  async createShipment(input: CreateShipmentInput): Promise<CarrierShipment> {
    const order = await this.request<CreateOrderResponse>('POST', '/orders/create/adhoc', {
      order_id: input.reference,
      order_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
      pickup_location: 'Primary', // the pickup address configured in the Shiprocket dashboard
      billing_customer_name: input.toAddress.name,
      billing_address: input.toAddress.addressLine1,
      billing_address_2: input.toAddress.addressLine2 ?? '',
      billing_city: input.toAddress.city,
      billing_pincode: input.toAddress.postalCode,
      billing_state: input.toAddress.stateCode ?? '',
      billing_country: input.toAddress.countryCode === 'IN' ? 'India' : input.toAddress.countryCode,
      billing_email: 'orders@example.com',
      billing_phone: input.toAddress.phone,
      shipping_is_billing: true,
      order_items: input.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.quantity,
        selling_price: (Number(item.unitPriceMinor) / 100).toFixed(2),
      })),
      payment_method: input.isCod ? 'COD' : 'Prepaid',
      sub_total: (
        input.items.reduce((sum, item) => sum + Number(item.unitPriceMinor) * item.quantity, 0) / 100
      ).toFixed(2),
      length: (input.dimensions?.lengthMm ?? 100) / 10,
      breadth: (input.dimensions?.widthMm ?? 100) / 10,
      height: (input.dimensions?.heightMm ?? 100) / 10,
      weight: input.weightGrams / 1000,
    });

    const assignment = await this.request<AssignAwbResponse>('POST', '/courier/assign/awb', {
      shipment_id: order.shipment_id,
    });

    return {
      carrierShipmentId: String(order.shipment_id),
      awbNumber: assignment.response?.data?.awb_code ?? null,
      trackingUrl: assignment.response?.data?.awb_code
        ? `https://shiprocket.co/tracking/${assignment.response.data.awb_code}`
        : null,
      raw: { order, assignment } as unknown as Record<string, unknown>,
    };
  }

  async cancelShipment(awbNumber: string): Promise<void> {
    await this.request('POST', '/orders/cancel', { awbs: [awbNumber] });
  }

  async schedulePickup(input: PickupRequestInput): Promise<PickupResult> {
    const response = await this.request<{
      pickup_status?: number;
      response?: { pickup_scheduled_date?: string; pickup_token_number?: string };
    }>('POST', '/courier/generate/pickup', { shipment_id: input.awbNumbers });

    return {
      pickupId: response.response?.pickup_token_number ?? '',
      scheduledDate: response.response?.pickup_scheduled_date ?? input.pickupDate,
      raw: response as unknown as Record<string, unknown>,
    };
  }

  async generateManifest(awbNumbers: string[]): Promise<ManifestResult> {
    const response = await this.request<{ manifest_url?: string }>('POST', '/manifests/generate', {
      shipment_id: awbNumbers,
    });
    if (!response.manifest_url) {
      throw new ExternalServiceError('shiprocket', 'Manifest generation returned no URL');
    }
    return { manifestUrl: response.manifest_url, raw: response as unknown as Record<string, unknown> };
  }

  async generateLabel(awbNumber: string): Promise<LabelResult> {
    const response = await this.request<{ label_url?: string }>('POST', '/courier/generate/label', {
      shipment_id: [awbNumber],
    });
    if (!response.label_url) {
      throw new ExternalServiceError('shiprocket', 'Label generation returned no URL');
    }
    return { labelUrl: response.label_url, raw: response as unknown as Record<string, unknown> };
  }

  async track(awbNumber: string): Promise<TrackingResult> {
    const response = await this.request<TrackingResponse>('GET', `/courier/track/awb/${encodeURIComponent(awbNumber)}`);
    const activities = response.tracking_data?.shipment_track_activities ?? [];

    const events: TrackingEvent[] = activities.map((activity) => {
      const eventAt = new Date(activity.date);
      return {
        status: mapStatus(activity.status),
        carrierStatusCode: activity.status,
        description: activity.activity,
        location: activity.location ?? null,
        eventAt,
        eventHash: createHash('sha256')
          .update(`${awbNumber}:${activity.status}:${activity.date}:${activity.activity}`)
          .digest('hex'),
      };
    });

    const currentStatus = mapStatus(response.tracking_data?.shipment_track?.[0]?.current_status ?? '');
    return { awbNumber, currentStatus, events };
  }

  /** See the class doc comment — Shiprocket's RTO is carrier-automatic, not merchant-triggered. */
  async initiateRto(awbNumber: string, reason: string): Promise<void> {
    this.logger.warn(
      `RTO requested for AWB ${awbNumber} (${reason}) — Shiprocket initiates RTO automatically ` +
        `after failed delivery attempts; this call records intent locally only.`,
    );
  }

  /**
   * Shiprocket's webhook auth is a static shared token in a header, not a
   * cryptographic signature — so the payload itself is never trusted for
   * status; `track()` is called to get the authoritative state, the same
   * "never trust the webhook body" rule every other adapter follows.
   */
  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<CarrierWebhookVerification> {
    const header = headers['x-api-key'];
    const token = Array.isArray(header) ? header[0] : header;

    if (!token || !this.config.webhookSecret || !safeEqualString(token, this.config.webhookSecret)) {
      return { valid: false, awbNumber: null, payload: {} };
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      return { valid: false, awbNumber: null, payload: {} };
    }

    const awb = payload['awb'] ?? payload['awb_code'];
    return { valid: true, awbNumber: typeof awb === 'string' ? awb : null, payload };
  }

  // -------------------------------------------------------------------------
  // Auth + HTTP
  // -------------------------------------------------------------------------

  private async token(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }

    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.config.email, password: this.config.password }),
    });

    if (!response.ok) {
      throw new ExternalServiceError('shiprocket', 'Failed to authenticate with Shiprocket', {
        status: response.status,
      });
    }

    const body = (await response.json()) as { token: string };
    this.cachedToken = { value: body.token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return body.token;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
    if (!this.isConfigured()) {
      throw new ExternalServiceError('shiprocket', 'Shiprocket credentials are not configured');
    }

    const token = await this.token();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        let message = text.slice(0, 300);
        try {
          const parsed = JSON.parse(text) as { message?: string };
          message = parsed.message ?? message;
        } catch {
          /* keep the raw text */
        }
        throw new ExternalServiceError('shiprocket', message, { status: response.status, path });
      }

      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError('shiprocket', 'Request timed out after 20s', { path });
      }
      throw new ExternalServiceError('shiprocket', error instanceof Error ? error.message : String(error), { path });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function mapStatus(carrierStatus: string): TrackingStatus {
  const normalized = carrierStatus.toUpperCase();
  if (normalized.includes('DELIVERED') && normalized.includes('RTO')) return 'RTO_DELIVERED';
  if (normalized.includes('RTO')) return 'RTO_INITIATED';
  if (normalized.includes('DELIVERED')) return 'DELIVERED';
  if (normalized.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY';
  if (normalized.includes('TRANSIT')) return 'IN_TRANSIT';
  if (normalized.includes('PICKED UP') || normalized.includes('PICKUP GENERATED')) return 'PICKED_UP';
  if (normalized.includes('PICKUP')) return 'PICKUP_SCHEDULED';
  if (normalized.includes('CANCEL')) return 'CANCELLED';
  if (normalized.includes('LOST')) return 'LOST';
  if (normalized.includes('DAMAGE')) return 'DAMAGED';
  if (normalized.includes('UNDELIVERED') || normalized.includes('FAILED')) return 'FAILED_DELIVERY';
  return 'IN_TRANSIT';
}

function safeEqualString(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
