/**
 * The contract every carrier integration implements.
 *
 * Five carriers are named in scope (Delhivery, Shiprocket, Blue Dart, DTDC,
 * XpressBees) and, exactly as docs/05 Phase 3 argues for payment gateways,
 * proving this port with **one** complete integration is worth more than
 * five half-finished ones — see `ShiprocketAdapter`. The others are future
 * adapters behind the same port, not a redesign.
 *
 * Deliberately not modelled here: which courier network a carrier uses
 * internally, or how their dashboard presents a shipment. Callers depend on
 * *intent* — "is this address servable, what would it cost, dispatch this
 * parcel" — never on a carrier's own vocabulary.
 */

export type CarrierName = 'delhivery' | 'shiprocket' | 'bluedart' | 'dtdc' | 'xpressbees' | 'stub';

export interface CarrierAddress {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateCode?: string | null;
  postalCode: string;
  countryCode: string;
}

export interface ServiceabilityInput {
  originPincode: string;
  destinationPincode: string;
  weightGrams: number;
  isCod: boolean;
  codAmountMinor?: string;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  estimatedDays?: number;
  reason?: string;
}

export interface RateResult {
  carrier: CarrierName;
  serviceType: string;
  rateMinor: string;
  currency: string;
  estimatedDays?: number;
}

export interface ShipmentItemInput {
  name: string;
  sku: string;
  quantity: number;
  unitPriceMinor: string;
}

export interface CreateShipmentInput {
  /** Our own shipment number — echoed back so a webhook or poll needs no lookup table. */
  reference: string;
  orderReference: string;
  fromAddress: CarrierAddress;
  toAddress: CarrierAddress;
  weightGrams: number;
  dimensions?: { lengthMm: number; widthMm: number; heightMm: number };
  isCod: boolean;
  codAmountMinor?: string;
  currency: string;
  items: ShipmentItemInput[];
}

export interface CarrierShipment {
  /** The carrier's shipment/order id, distinct from the AWB (some carriers assign it separately). */
  carrierShipmentId: string;
  awbNumber: string | null;
  trackingUrl: string | null;
  raw: Record<string, unknown>;
}

export interface PickupRequestInput {
  fromAddress: CarrierAddress;
  awbNumbers: string[];
  pickupDate: string;
}

export interface PickupResult {
  pickupId: string;
  scheduledDate: string;
  raw: Record<string, unknown>;
}

export interface ManifestResult {
  manifestUrl: string;
  raw: Record<string, unknown>;
}

export interface LabelResult {
  labelUrl: string;
  raw: Record<string, unknown>;
}

export const TRACKING_STATUSES = [
  'PENDING',
  'LABEL_CREATED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED_DELIVERY',
  'RTO_INITIATED',
  'RTO_DELIVERED',
  'CANCELLED',
  'LOST',
  'DAMAGED',
] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export interface TrackingEvent {
  status: TrackingStatus;
  carrierStatusCode?: string | null;
  description: string;
  location?: string | null;
  eventAt: Date;
  /** Dedupe key — carriers replay the same scan repeatedly on both webhook and poll. */
  eventHash: string;
}

export interface TrackingResult {
  awbNumber: string;
  currentStatus: TrackingStatus;
  events: TrackingEvent[];
}

export interface CarrierWebhookVerification {
  valid: boolean;
  awbNumber: string | null;
  payload: Record<string, unknown>;
}

export interface ShippingCarrierPort {
  readonly name: CarrierName;

  /** True when credentials are configured. An unconfigured carrier must not be offered. */
  isConfigured(): boolean;

  checkServiceability(input: ServiceabilityInput): Promise<ServiceabilityResult>;

  /** Rate cards for every service level this carrier offers on the route — checkout picks one. */
  getRates(input: ServiceabilityInput): Promise<RateResult[]>;

  createShipment(input: CreateShipmentInput): Promise<CarrierShipment>;

  cancelShipment(awbNumber: string): Promise<void>;

  schedulePickup(input: PickupRequestInput): Promise<PickupResult>;

  generateManifest(awbNumbers: string[]): Promise<ManifestResult>;

  generateLabel(awbNumber: string): Promise<LabelResult>;

  /** Authoritative tracking read — used by both the polling sweep and to cross-check a webhook. */
  track(awbNumber: string): Promise<TrackingResult>;

  /** Merchant- or carrier-initiated return-to-origin after a failed/refused delivery. */
  initiateRto(awbNumber: string, reason: string): Promise<void>;

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<CarrierWebhookVerification>;
}

export const SHIPPING_CARRIERS = 'SHIPPING_CARRIERS';
