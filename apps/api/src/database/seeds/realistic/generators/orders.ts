import { Money } from '@ems/kernel';
import { addMs, base36Stamp, dayWeight, istMidnightUtc, MS_DAY, MS_HOUR, MS_MINUTE, timeOnDay } from '../dates';
import { hexFrom, type Rng } from '../rng';
import type { CouponSpec } from '../types';
import type { CatalogModel, ProductModel, VariantModel } from './catalog';
import { type Ctx, rupeesToMinor } from './context';
import type { CoreModel } from './core';
import type { CustomerModel } from './customers';
import type {
  CouponModel,
  HistoryEntry,
  LineModel,
  OrderModel,
  Outcome,
  PaymentMethodCode,
  PaymentModel,
  RefundModel,
  ReturnModel,
  ShipmentModel,
  TaxPart,
} from './order-types';

export const ORDER_COUNT = 150;
const COD_FEE_MINOR = 3000; // identical to COD_FEE_MINOR in checkout.service.ts
const EXPRESS_SURCHARGE_MINOR = 8000;

const USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36',
];
const UTMS: Record<string, string>[] = [
  { source: 'google', medium: 'cpc', campaign: 'brand-search' },
  { source: 'instagram', medium: 'social', campaign: 'festive-reels' },
  { source: 'newsletter', medium: 'email', campaign: 'weekly-deals' },
  { source: 'facebook', medium: 'paid-social', campaign: 'retargeting' },
  { source: 'whatsapp', medium: 'referral', campaign: 'order-share' },
];
const CUSTOMER_NOTES = [
  'Please deliver after 6 PM.',
  'Call before delivery.',
  'Leave with the security guard if not at home.',
  'Gift: please do not include the invoice.',
  'Deliver on a weekday only.',
];
const CANCEL_REASONS_CUSTOMER = ['Changed my mind', 'Ordered by mistake', 'Found a better price elsewhere', 'Delivery time too long', 'Need to change the delivery address'];
const RETURN_REASONS: { reason: string; detail: string }[] = [
  { reason: 'SIZE_ISSUE', detail: 'The size does not fit as expected.' },
  { reason: 'DAMAGED', detail: 'The package arrived damaged.' },
  { reason: 'NOT_AS_DESCRIBED', detail: 'The product does not match the description on the website.' },
  { reason: 'DEFECTIVE', detail: 'The item stopped working after a day of use.' },
  { reason: 'CHANGED_MIND', detail: 'I no longer need this item.' },
  { reason: 'WRONG_ITEM', detail: 'I received a different item from what I ordered.' },
];
const CITY_HUBS = ['Delhi Hub', 'Mumbai Hub', 'Bengaluru Hub', 'Kolkata Hub', 'Hyderabad Hub', 'Chennai Hub', 'Ahmedabad Hub', 'Pune Hub'];
export const ORIGIN_PLACEHOLDER = '@ORIGIN';
const BANKS = ['Demo National Bank', 'Sample Union Bank', 'Test Co-operative Bank', 'Example Savings Bank'];

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** Largest-remainder apportionment of `total` over weights. */
export function apportion<T extends string>(weights: readonly (readonly [T, number])[], total: number): Map<T, number> {
  const sum = weights.reduce((acc, [, w]) => acc + w, 0);
  const exact = weights.map(([key, w]) => ({ key, value: (w / sum) * total }));
  const result = new Map<T, number>(exact.map((e) => [e.key, Math.floor(e.value)] as const));
  let leftover = total - [...result.values()].reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, index) => ({ ...e, index, frac: e.value - Math.floor(e.value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; leftover > 0; i = (i + 1) % order.length) {
    const entry = order[i]!;
    result.set(entry.key, (result.get(entry.key) ?? 0) + 1);
    leftover -= 1;
  }
  return result;
}

function planOutcomes(total: number): Outcome[] {
  const top = apportion(
    [['DELIVERED', 60], ['INFLIGHT', 15], ['PENDINGGROUP', 8], ['CANCELLED', 9], ['RETURNED', 8]] as const,
    total,
  );
  const inflight = apportion([['SHIPPED', 52], ['PROCESSING', 26], ['CONFIRMED', 22]] as const, top.get('INFLIGHT') ?? 0);
  const pending = apportion([['PENDING', 66], ['PENDING_FAILED', 17], ['ON_HOLD', 17]] as const, top.get('PENDINGGROUP') ?? 0);
  const cancelled = apportion([['CANCELLED_PENDING', 40], ['CANCELLED_CONFIRMED', 60]] as const, top.get('CANCELLED') ?? 0);
  const returned = apportion(
    [['RTO', 42], ['RETURN_COMPLETED', 25], ['RETURN_REJECTED', 8], ['RETURN_RECEIVED', 8], ['RETURN_APPROVED', 8], ['RETURN_REQUESTED', 9]] as const,
    top.get('RETURNED') ?? 0,
  );
  const outcomes: Outcome[] = [];
  const push = (map: Map<string, number>) => {
    for (const [key, count] of map) for (let i = 0; i < count; i += 1) outcomes.push(key as Outcome);
  };
  for (let i = 0; i < (top.get('DELIVERED') ?? 0); i += 1) outcomes.push('DELIVERED');
  push(inflight);
  push(pending);
  push(cancelled);
  push(returned);
  return outcomes;
}

const AGE_RANGES: Partial<Record<Outcome, [number, number]>> = {
  DELIVERED: [9, 178],
  RTO: [16, 178],
  RETURN_COMPLETED: [34, 178],
  RETURN_RECEIVED: [24, 120],
  RETURN_APPROVED: [20, 90],
  RETURN_REQUESTED: [15, 60],
  RETURN_REJECTED: [18, 100],
  CANCELLED_CONFIRMED: [1, 178],
  CANCELLED_PENDING: [1, 178],
};

/** Samples a placement time between `minAge` and `maxAge` days before now, weighted by day demand. */
function sampleWeightedTime(ctx: Ctx, rng: Rng, minAge: number, maxAge: number): Date {
  const days: { start: Date; weight: number }[] = [];
  for (let k = Math.ceil(minAge); k <= Math.floor(maxAge); k += 1) {
    const dayStart = istMidnightUtc(new Date(ctx.now.getTime() - k * MS_DAY));
    days.push({ start: dayStart, weight: dayWeight(dayStart, ctx.spec.weekendBoost) });
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const day = rng.weighted(days.map((d) => [d, d.weight] as const));
    const ts = timeOnDay(day.start, rng);
    const age = (ctx.now.getTime() - ts.getTime()) / MS_DAY;
    if (age >= minAge && age <= maxAge) return ts;
  }
  return new Date(ctx.now.getTime() - ((minAge + maxAge) / 2) * MS_DAY);
}

/** Creation timestamps for every order, one per planned outcome. Sorted by the caller. */
function sampleCreationTimes(ctx: Ctx, outcome: Outcome, rng: Rng): { createdAt: Date; confirmedAt?: Date; shippedAt?: Date } {
  const now = ctx.now.getTime();
  switch (outcome) {
    case 'SHIPPED': {
      const shippedAt = new Date(now - rng.float() * 4.7 * MS_DAY - 0.3 * MS_DAY);
      const confirmedAt = new Date(shippedAt.getTime() - (6 + rng.float() * 20) * MS_HOUR);
      return { createdAt: confirmedAt, confirmedAt, shippedAt };
    }
    case 'PROCESSING': {
      const confirmedAt = new Date(now - (0.15 + rng.float() * 4.35) * MS_DAY);
      return { createdAt: confirmedAt, confirmedAt };
    }
    case 'CONFIRMED': {
      const confirmedAt = new Date(now - (0.05 + rng.float() * 1.95) * MS_DAY);
      return { createdAt: confirmedAt, confirmedAt };
    }
    case 'ON_HOLD': {
      const confirmedAt = new Date(now - (0.3 + rng.float() * 5.7) * MS_DAY);
      return { createdAt: confirmedAt, confirmedAt };
    }
    case 'PENDING':
      return { createdAt: new Date(now - (0.05 + rng.float() * 2.95) * MS_DAY) };
    case 'PENDING_FAILED':
      return { createdAt: new Date(now - (0.1 + rng.float() * 4.9) * MS_DAY) };
    default: {
      const [lo, hi] = AGE_RANGES[outcome] ?? [9, 178];
      return { createdAt: sampleWeightedTime(ctx, rng, lo, hi) };
    }
  }
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

function pickProducts(ctx: Ctx, rng: Rng, catalog: CatalogModel, count: number, createdAt: Date): ProductModel[] {
  const ageDays = (ctx.now.getTime() - createdAt.getTime()) / MS_DAY;
  const pool = catalog.products.filter((p) => p.status === 'ACTIVE' || (p.status === 'ARCHIVED' && ageDays > 60));
  const chosen: ProductModel[] = [];
  const remaining = [...pool];
  for (let i = 0; i < count && remaining.length > 0; i += 1) {
    const pick = rng.weighted(remaining.map((p) => [p, p.popularity * Math.pow(5000 / (p.priceMinor / 100 + 500), 0.3)] as const));
    chosen.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
  return chosen;
}

function computeLineTax(subtotalMinor: number, gst: number, intraState: boolean): { rate: string; tax: number; breakup: TaxPart[] } {
  const rate = `${gst}.0000`;
  const base = Money.fromMinor(subtotalMinor, 'INR');
  if (gst === 0) {
    return { rate, tax: 0, breakup: [{ name: 'GST 0%', rate, amountMinor: '0' }] };
  }
  const tax = base.percentage(rate);
  const components = intraState ? [{ name: 'CGST', rate: gst / 2 }, { name: 'SGST', rate: gst / 2 }] : [{ name: 'IGST', rate: gst }];
  const shares = tax.allocate(components.map((c) => BigInt(Math.round(c.rate * 100))));
  return {
    rate,
    tax: Number(tax.amountMinor),
    breakup: components.map((c, i) => ({ name: c.name, rate: String(c.rate), amountMinor: shares[i]!.amountMinor.toString() })),
  };
}

function makeLine(orderNumber: string, product: ProductModel, variant: VariantModel | null, qty: number, intraState: boolean): LineModel {
  const unit = variant?.priceMinor ?? product.priceMinor;
  const subtotal = unit * qty;
  const tax = computeLineTax(subtotal, product.gst, intraState);
  const sku = variant?.sku ?? (product.sku as string);
  return {
    itemNk: `${orderNumber}|${sku}`,
    product,
    variant,
    qty,
    sku,
    name: product.name,
    variantTitle: variant?.title ?? null,
    imageUrl: product.imageUrls[0]!,
    hsn: product.hsn,
    unitMinor: unit,
    costMinor: variant?.costMinor ?? product.costMinor,
    subtotalMinor: subtotal,
    discountMinor: 0,
    taxRate: tax.rate,
    taxMinor: tax.tax,
    taxBreakup: tax.breakup,
    totalMinor: subtotal + tax.tax,
    qtyFulfilled: 0,
    qtyReturned: 0,
    qtyCancelled: 0,
    allocations: [],
  };
}

function discountFor(coupon: CouponSpec, subtotalMinor: number): number {
  let discount = 0;
  if (coupon.type === 'PERCENTAGE') discount = Number(Money.fromMinor(subtotalMinor, 'INR').percentage(`${coupon.value}.0000`).amountMinor);
  else if (coupon.type === 'FIXED_AMOUNT') discount = rupeesToMinor(coupon.value);
  if (coupon.maxDiscountRupees) discount = Math.min(discount, rupeesToMinor(coupon.maxDiscountRupees));
  return Math.min(discount, subtotalMinor);
}

// ---------------------------------------------------------------------------
// Builders for the pieces of a lifecycle
// ---------------------------------------------------------------------------

function ids(slug: string, order: OrderModel, kind: string): { orderId: string; paymentId: string } {
  // The tenant slug is part of the key: gateway payment ids are globally unique (`uq_payments_gateway_ref`).
  const key = `${slug}|${order.number}|${kind}`;
  return { orderId: `stub_order_${hexFrom(key, 16)}`, paymentId: `stub_pay_${hexFrom(`${key}|pay`, 16)}` };
}

function feeFor(method: PaymentMethodCode, amount: number): { fee: number; tax: number } {
  const rate = method === 'CARD' || method === 'EMI' ? 0.02 : method === 'NETBANKING' ? 0.012 : method === 'WALLET' ? 0.015 : 0;
  const fee = Math.round(amount * rate);
  return { fee, tax: Math.round(fee * 0.18) };
}

function newPayment(ctx: Ctx, order: OrderModel, rng: Rng, o: { status: PaymentModel['status']; at: Date; capturedAt?: Date | null; failedAt?: Date | null }): PaymentModel {
  const online = order.method !== 'COD';
  const { orderId, paymentId } = ids(ctx.spec.slug, order, 'p1');
  const captured = o.status === 'CAPTURED' || o.status === 'PARTIALLY_REFUNDED' || o.status === 'REFUNDED';
  const fees = online && captured ? feeFor(order.method, order.totalMinor) : null;
  const person = `${order.customer.first}.${order.customer.last}`.toLowerCase().replace(/[^a-z.]/g, '');
  const cardish = order.method === 'CARD' || order.method === 'EMI';
  const network = rng.pick(['VISA', 'MASTERCARD', 'RUPAY']);
  return {
    nk: `${order.number}|1`,
    gateway: online ? 'STUB' : 'COD',
    method: order.method,
    status: o.status,
    amountMinor: order.totalMinor,
    capturedMinor: captured ? order.totalMinor : 0,
    refundedMinor: 0,
    createdAt: o.at,
    updatedAt: o.capturedAt ?? o.failedAt ?? o.at,
    capturedAt: captured ? (o.capturedAt ?? o.at) : null,
    failedAt: o.failedAt ?? null,
    errorCode: o.status === 'FAILED' ? rng.pick(['STUB_DECLINED', 'INSUFFICIENT_FUNDS', 'AUTH_FAILED']) : null,
    errorMessage: o.status === 'FAILED' ? rng.pick(['Simulated decline', 'Payment declined by the issuer', 'Authentication failed']) : null,
    gatewayOrderId: online ? orderId : null,
    gatewayPaymentId: online && (captured || o.status === 'FAILED') ? paymentId : null,
    feeMinor: fees ? fees.fee : null,
    feeTaxMinor: fees ? fees.tax : null,
    netMinor: fees ? order.totalMinor - fees.fee - fees.tax : null,
    cardLast4: online && cardish ? String(parseInt(hexFrom(`${ctx.spec.slug}|${order.number}|card`, 4), 16) % 10000).padStart(4, '0') : null,
    cardBrand: online && cardish ? 'Demo Bank Platinum' : null,
    cardNetwork: online && cardish ? network : null,
    upiVpa: online && order.method === 'UPI' ? `${person}${order.customer.index}@testupi` : null,
    bankName: online && order.method === 'NETBANKING' ? rng.pick(BANKS) : online && order.method === 'WALLET' ? 'TestWallet' : null,
    // Settlement reconciliation has run for anything captured more than three days before the fixed "now".
    reconciledAt: captured && online && o.at.getTime() < ctx.now.getTime() - 3 * MS_DAY ? addMs(o.at, 2 * MS_DAY) : null,
  };
}

function refundPayment(order: OrderModel, payment: PaymentModel, amount: number, at: Date, reason: string, returnRma: string | null, n: number): RefundModel {
  payment.refundedMinor += amount;
  payment.status = payment.refundedMinor >= payment.capturedMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  payment.updatedAt = at;
  order.amountRefundedMinor += amount;
  const refund: RefundModel = { nk: `${order.number}|R${n}`, paymentNk: payment.nk, amountMinor: amount, reason, status: 'COMPLETED', at, returnRma };
  order.refunds.push(refund);
  return refund;
}

function hist(order: OrderModel, entry: Omit<HistoryEntry, 'reason'> & { reason?: string | null }): void {
  order.history.push({ reason: null, ...entry });
}

function shipmentEvents(rng: Rng, order: OrderModel, shipment: ShipmentModel, finalStatus: string, upTo: Date): void {
  const hub = (): string => rng.pick(CITY_HUBS);
  // The dispatching warehouse is only known once stock is allocated, so origin scans use a placeholder
  // that the row emitter swaps for the real warehouse city.
  const origin = ORIGIN_PLACEHOLDER;
  const steps: { status: string; frac: number; description: string; location: string }[] = [
    { status: 'LABEL_CREATED', frac: 0, description: 'Shipment label created', location: origin },
    { status: 'PICKED_UP', frac: 0.12, description: 'Picked up from the warehouse', location: origin },
    { status: 'IN_TRANSIT', frac: 0.35, description: 'Arrived at the sorting hub', location: hub() },
    { status: 'IN_TRANSIT', frac: 0.6, description: 'Departed from the transit hub', location: hub() },
    { status: 'OUT_FOR_DELIVERY', frac: 0.9, description: 'Out for delivery', location: order.address.city },
    { status: 'DELIVERED', frac: 1, description: 'Delivered to the customer', location: order.address.city },
  ];
  const start = shipment.createdAt.getTime();
  const end = (shipment.deliveredAt ?? upTo).getTime();
  const rank = ['LABEL_CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const limit = rank.indexOf(finalStatus === 'PICKUP_SCHEDULED' ? 'LABEL_CREATED' : finalStatus);
  for (const step of steps) {
    if (rank.indexOf(step.status) > limit && limit >= 0) break;
    const at = new Date(start + (end - start) * step.frac);
    if (at.getTime() > upTo.getTime()) break;
    shipment.events.push({ status: step.status, at, location: step.location, description: step.description });
  }
}

interface ShipmentPlan {
  createdAt: Date;
  /** 'DELIVERED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'PICKED_UP' | 'RTO_DELIVERED' | 'LABEL_CREATED' */
  finalStatus: string;
  deliveredAt?: Date;
  upTo: Date;
  items?: { line: LineModel; qty: number }[];
}

function buildShipment(ctx: Ctx, rng: Rng, order: OrderModel, usedNumbers: Set<string>, usedAwbs: Set<string>, plan: ShipmentPlan, primaryWh: string): ShipmentModel {
  let stamp = plan.createdAt.getTime();
  let number = `SHP-${base36Stamp(new Date(stamp))}`;
  while (usedNumbers.has(number)) {
    stamp += 1;
    number = `SHP-${base36Stamp(new Date(stamp))}`;
  }
  usedNumbers.add(number);
  let awb = `STUB${hexFrom(`${ctx.spec.slug}|${number}`, 12).toUpperCase()}`;
  while (usedAwbs.has(awb)) awb = `STUB${hexFrom(`${awb}|x`, 12).toUpperCase()}`;
  usedAwbs.add(awb);

  const items = plan.items ?? order.lines.map((line) => ({ line, qty: line.qty }));
  const weight = items.reduce((sum, i) => sum + (i.line.variant?.weightG ?? i.line.product.weightG) * i.qty, 0);
  const isCod = order.method === 'COD';
  const transitDays = 2 + rng.float() * 3.5;
  const shipment: ShipmentModel = {
    number,
    awb,
    status: plan.finalStatus,
    createdAt: plan.createdAt,
    updatedAt: plan.deliveredAt ?? plan.upTo,
    warehouse: order.lines[0]?.allocations[0]?.warehouse ?? primaryWh,
    service: order.express ? 'EXPRESS' : 'STANDARD',
    items,
    weightG: Math.max(100, weight),
    isCod,
    codAmountMinor: isCod ? order.totalMinor : 0,
    costMinor: order.shippingMinor > 0 ? order.shippingMinor : 4000 + Math.ceil(weight / 500) * 500,
    pickedUpAt: addMs(plan.createdAt, (3 + rng.float() * 5) * MS_HOUR),
    shippedAt: plan.createdAt,
    expectedDeliveryAt: addMs(plan.createdAt, transitDays * MS_DAY),
    deliveredAt: plan.finalStatus === 'DELIVERED' ? (plan.deliveredAt ?? null) : null,
    rtoInitiatedAt: null,
    events: [],
  };
  return shipment;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export interface OrdersResult {
  orders: OrderModel[];
  coupons: CouponModel[];
}

export function buildOrders(ctx: Ctx, core: CoreModel, catalog: CatalogModel, customers: CustomerModel[]): OrdersResult {
  const { spec } = ctx;
  const primaryWh = core.warehouses[0]!.code;
  const outcomes = planOutcomes(ORDER_COUNT);

  // 1. Creation times, then chronological numbering.
  interface Draft {
    outcome: Outcome;
    createdAt: Date;
    confirmedAt?: Date;
    shippedAt?: Date;
    index: number;
  }
  const drafts: Draft[] = outcomes.map((outcome, index) => ({ outcome, index, ...sampleCreationTimes(ctx, outcome, ctx.rng('order-time', index)) }));
  drafts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.index - b.index);
  // Strictly increasing creation instants keep numbering unambiguous.
  for (let i = 1; i < drafts.length; i += 1) {
    if (drafts[i]!.createdAt.getTime() <= drafts[i - 1]!.createdAt.getTime()) {
      const shift = drafts[i - 1]!.createdAt.getTime() + 1 - drafts[i]!.createdAt.getTime();
      drafts[i]!.createdAt = addMs(drafts[i]!.createdAt, shift);
      if (drafts[i]!.confirmedAt) drafts[i]!.confirmedAt = addMs(drafts[i]!.confirmedAt!, shift);
      if (drafts[i]!.shippedAt) drafts[i]!.shippedAt = addMs(drafts[i]!.shippedAt!, shift);
    }
  }

  // 2. Customers: every one of the first 70 (shuffled) customers gets an order; the rest follow activity weights.
  const custRng = ctx.rng('order-customers');
  const order70 = custRng.shuffle(customers).slice(0, 70);
  const customerForSlot: CustomerModel[] = [];
  for (let i = 0; i < drafts.length; i += 1) {
    customerForSlot.push(i < 70 ? order70[i]! : custRng.weighted(customers.map((c) => [c, c.activity] as const)));
  }
  const slotOrder = custRng.shuffle(customerForSlot.map((_, i) => i));

  // 3. Coupons, with their validity windows.
  const coupons: CouponModel[] = spec.coupons.map((c) => ({
    code: c.code,
    spec: c,
    startsAt: addMs(ctx.now, -c.startDaysAgo * MS_DAY),
    endsAt: c.endDaysAgo === undefined ? null : addMs(ctx.now, -c.endDaysAgo * MS_DAY),
    usageCount: 0,
  }));
  const couponUses = new Map<string, number>(); // `${code}|${customer}` -> non-cancelled uses

  // COD / online forcing per outcome.
  const rtoMethods = new Map<number, 'COD' | 'ONLINE'>();
  let rtoSeen = 0;
  for (const d of drafts) if (d.outcome === 'RTO') rtoMethods.set(d.index, rtoSeen++ < 3 ? 'COD' : 'ONLINE');

  const orders: OrderModel[] = [];
  const usedShipNumbers = new Set<string>();
  const usedAwbs = new Set<string>();
  const usedRma = new Set<string>();
  const onlineMix = spec.paymentMix.filter(([m]) => m !== 'COD');

  drafts.forEach((draft, position) => {
    const seq = position + 1;
    const number = `ORD-${String(seq).padStart(6, '0')}`;
    const rng = ctx.rng('order', seq);
    const customer = customerForSlot[slotOrder[position]!]!;

    // Address, then tax jurisdiction.
    const address = rng.chance(0.82) ? customer.addresses[0]! : rng.pick(customer.addresses);
    const intraState = address.stateCode === core.homeStateCode;

    // Payment method.
    const forced = rtoMethods.get(draft.index);
    let method: PaymentMethodCode;
    if (draft.outcome === 'ON_HOLD' || forced === 'COD') method = 'COD';
    else if (draft.outcome === 'PENDING' || draft.outcome === 'PENDING_FAILED' || draft.outcome === 'CANCELLED_PENDING' || forced === 'ONLINE') {
      method = rng.weighted(onlineMix.map(([m, w]) => [m as PaymentMethodCode, w] as const));
    } else method = rng.weighted(spec.paymentMix.map(([m, w]) => [m as PaymentMethodCode, w] as const));

    // Lines.
    const lineCount = rng.weighted(spec.lineMix.map(([n, w]) => [n, w] as const));
    const picked = pickProducts(ctx, rng, catalog, lineCount, draft.createdAt);
    const lines: LineModel[] = picked.map((product) => {
      const variant = product.type === 'VARIABLE' ? rng.pick(product.variants) : null;
      const unit = variant?.priceMinor ?? product.priceMinor;
      const qty = unit > 2_000_000 ? 1 : rng.weighted(spec.qtyMix.map(([q, w]) => [q, w] as const));
      return makeLine(number, product, variant, qty, intraState);
    });
    // Two lines can never share a SKU: the pool picks distinct products, so this holds by construction.
    const subtotal = lines.reduce((s, l) => s + l.subtotalMinor, 0);

    // Coupon (chosen chronologically so limits are respected at the moment of use).
    let coupon: CouponModel | null = null;
    let discount = 0;
    if (rng.chance(0.3)) {
      const at = draft.createdAt.getTime();
      const eligible = coupons.filter((c) => {
        if (c.spec.status === 'ARCHIVED' || c.spec.weight <= 0) return false;
        if (at < c.startsAt.getTime() || (c.endsAt && at > c.endsAt.getTime())) return false;
        if (c.spec.minOrderRupees && subtotal < rupeesToMinor(c.spec.minOrderRupees)) return false;
        if (c.spec.usageLimitTotal !== undefined && c.usageCount >= c.spec.usageLimitTotal) return false;
        const usedBy = couponUses.get(`${c.code}|${customer.index}`) ?? 0;
        if (c.spec.usageLimitPerCustomer !== undefined && usedBy >= c.spec.usageLimitPerCustomer) return false;
        return true;
      });
      if (eligible.length > 0) {
        coupon = rng.weighted(eligible.map((c) => [c, c.spec.weight] as const));
        discount = discountFor(coupon.spec, subtotal);
      }
    }
    if (discount > 0) {
      const shares = Money.fromMinor(discount, 'INR').allocate(lines.map((l) => BigInt(l.subtotalMinor)));
      lines.forEach((l, i) => {
        l.discountMinor = Number(shares[i]!.amountMinor);
        l.totalMinor = l.subtotalMinor - l.discountMinor + l.taxMinor;
      });
    }

    // Shipping and COD fee.
    const express = rng.chance(0.1);
    let shipping = subtotal >= rupeesToMinor(spec.freeShippingRupees) ? 0 : rupeesToMinor(spec.shippingRupees);
    if (coupon && coupon.spec.type === 'FREE_SHIPPING') shipping = 0;
    if (express) shipping += EXPRESS_SURCHARGE_MINOR;
    // A FREE_SHIPPING coupon only counts as used when it actually saved shipping.
    if (coupon && coupon.spec.type === 'FREE_SHIPPING' && shipping === 0 && subtotal >= rupeesToMinor(spec.freeShippingRupees)) coupon = null;

    const codFee = method === 'COD' ? COD_FEE_MINOR : 0;
    const tax = lines.reduce((s, l) => s + l.taxMinor, 0);
    const total = subtotal - discount + shipping + codFee + tax;
    if (method === 'EMI' && total < 300_000) method = 'CARD';

    const order: OrderModel = {
      seq,
      number,
      outcome: draft.outcome,
      createdAt: draft.createdAt,
      updatedAt: draft.createdAt,
      customer,
      address,
      method,
      lines,
      coupon,
      redeemsCoupon: coupon !== null,
      express,
      subtotalMinor: subtotal,
      discountMinor: discount,
      shippingMinor: shipping,
      codFeeMinor: codFee,
      taxMinor: tax,
      totalMinor: total,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      fulfilmentStatus: 'UNFULFILLED',
      amountPaidMinor: 0,
      amountRefundedMinor: 0,
      placedAt: null,
      confirmedAt: null,
      deliveredAt: null,
      closedAt: null,
      cancelledAt: null,
      cancelReason: null,
      customerNote: rng.chance(0.08) ? rng.pick(CUSTOMER_NOTES) : null,
      internalNote: null,
      tags: null,
      userAgent: rng.pick(USER_AGENTS),
      utm: rng.chance(0.35) ? rng.pick(UTMS) : null,
      history: [],
      payments: [],
      refunds: [],
      shipments: [],
      returns: [],
      reservedAt: draft.createdAt,
      committedAt: null,
      releasedAt: null,
      cancelRestockAt: null,
      rtoAt: null,
    };
    if (coupon) {
      coupon.usageCount += 1;
      const outcomeCancelled = draft.outcome === 'CANCELLED_PENDING' || draft.outcome === 'CANCELLED_CONFIRMED';
      if (outcomeCancelled) {
        // The redemption is released on cancel: capacity was consumed at placement, not afterwards.
        order.redeemsCoupon = false;
      } else {
        couponUses.set(`${coupon.code}|${customer.index}`, (couponUses.get(`${coupon.code}|${customer.index}`) ?? 0) + 1);
      }
    }

    applyLifecycle(ctx, rng, order, draft, { usedShipNumbers, usedAwbs, usedRma, primaryWh });
    orders.push(order);
  });

  // Released redemptions give their capacity back: recompute final usage counts from live redemptions.
  for (const c of coupons) c.usageCount = orders.filter((o) => o.coupon?.code === c.code && o.redeemsCoupon).length;
  return { orders, coupons };
}

// ---------------------------------------------------------------------------
// Lifecycles
// ---------------------------------------------------------------------------

interface LifeEnv {
  usedShipNumbers: Set<string>;
  usedAwbs: Set<string>;
  usedRma: Set<string>;
  primaryWh: string;
}

function confirmOnline(order: OrderModel, rng: Rng): Date {
  return addMs(order.createdAt, (35 + rng.float() * 200) * 1000);
}

function applyLifecycle(
  ctx: Ctx,
  rng: Rng,
  order: OrderModel,
  draft: { outcome: Outcome; createdAt: Date; confirmedAt?: Date; shippedAt?: Date },
  env: LifeEnv,
): void {
  const online = order.method !== 'COD';
  const now = ctx.now;
  const total = order.totalMinor;
  const setUpdated = (at: Date): void => {
    if (at.getTime() > order.updatedAt.getTime()) order.updatedAt = at;
  };

  hist(order, { type: 'ORDER', from: null, to: 'PENDING', actor: 'CUSTOMER', staffKey: null, at: order.createdAt });

  // --- Confirmation (every outcome except never-confirmed pending / cancelled-pending) ---------
  const confirms = !['PENDING', 'PENDING_FAILED', 'CANCELLED_PENDING'].includes(order.outcome);
  let confirmedAt: Date | null = null;
  if (confirms) {
    // COD confirms within seconds; a gateway capture lands a minute or three after the checkout.
    confirmedAt = online ? confirmOnline(order, rng) : addMs(order.createdAt, (2 + rng.float() * 7) * 1000);
    order.confirmedAt = confirmedAt;
    order.placedAt = confirmedAt;
    order.committedAt = confirmedAt;
    order.status = 'CONFIRMED';
    hist(order, { type: 'ORDER', from: 'PENDING', to: 'CONFIRMED', actor: online ? 'WEBHOOK' : 'SYSTEM', staffKey: null, at: confirmedAt });
    setUpdated(confirmedAt);
  }

  const makeOnlinePayment = (status: PaymentModel['status'], capturedAt?: Date): PaymentModel => {
    const payment = newPayment(ctx, order, rng, { status, at: order.createdAt, capturedAt: capturedAt ?? null, failedAt: status === 'FAILED' ? addMs(order.createdAt, (60 + rng.float() * 120) * 1000) : null });
    order.payments.push(payment);
    return payment;
  };

  // Captures an online payment (or leaves COD pending) once confirmed.
  const takePayment = (): PaymentModel => {
    if (online) {
      const payment = makeOnlinePayment('CAPTURED', confirmedAt as Date);
      order.paymentStatus = 'PAID';
      order.amountPaidMinor = total;
      return payment;
    }
    const payment = newPayment(ctx, order, rng, { status: 'PENDING', at: order.createdAt });
    order.payments.push(payment);
    return payment;
  };

  const staffActor = (key: 'orders' | 'admin' | 'stock' = 'orders'): { actor: 'USER'; staffKey: string } => ({ actor: 'USER', staffKey: key });

  // Builds one shipment covering every open line.
  const ship = (createdAt: Date, finalStatus: string, deliveredAt: Date | undefined, upTo: Date, items?: { line: LineModel; qty: number }[]): ShipmentModel => {
    const shipment = buildShipment(ctx, rng, order, env.usedShipNumbers, env.usedAwbs, { createdAt, finalStatus, deliveredAt, upTo, items }, env.primaryWh);
    shipmentEvents(rng, order, shipment, finalStatus === 'RTO_DELIVERED' ? 'IN_TRANSIT' : finalStatus, upTo);
    order.shipments.push(shipment);
    for (const item of shipment.items) item.line.qtyFulfilled += item.qty;
    return shipment;
  };

  switch (order.outcome) {
    case 'PENDING': {
      order.status = 'PENDING';
      makeOnlinePayment('PENDING');
      order.paymentStatus = 'PENDING';
      break;
    }
    case 'PENDING_FAILED': {
      order.status = 'PENDING';
      const failed = makeOnlinePayment('FAILED');
      order.paymentStatus = 'FAILED';
      hist(order, { type: 'PAYMENT', from: 'PENDING', to: 'FAILED', actor: 'WEBHOOK', staffKey: null, at: failed.failedAt as Date, reason: failed.errorMessage });
      setUpdated(failed.failedAt as Date);
      break;
    }
    case 'ON_HOLD': {
      takePayment();
      const holdAt = addMs(confirmedAt as Date, (1 + rng.float() * 3) * MS_HOUR);
      order.status = 'ON_HOLD';
      order.internalNote = 'Placed on hold: address verification pending with the customer.';
      hist(order, { type: 'ORDER', from: 'CONFIRMED', to: 'ON_HOLD', reason: 'Address verification pending', ...staffActor('orders'), at: holdAt });
      setUpdated(holdAt);
      break;
    }
    case 'CONFIRMED': {
      takePayment();
      break;
    }
    case 'PROCESSING': {
      takePayment();
      const procAt = addMs(confirmedAt as Date, (1 + rng.float() * 5) * MS_HOUR);
      order.status = 'PROCESSING';
      hist(order, { type: 'ORDER', from: 'CONFIRMED', to: 'PROCESSING', ...staffActor('orders'), at: procAt });
      setUpdated(procAt);
      // A couple of multi-line orders ship in two parcels; the first has gone out.
      if (order.lines.length >= 2 && order.seq % 3 === 0 && now.getTime() - procAt.getTime() > 4 * MS_HOUR) {
        const first = order.lines[0]!;
        const shipAt = addMs(procAt, (2 + rng.float() * 3) * MS_HOUR);
        if (shipAt.getTime() < now.getTime() - 30 * MS_MINUTE) {
          const shipment = ship(shipAt, 'LABEL_CREATED', undefined, now, [{ line: first, qty: first.qty }]);
          shipment.pickedUpAt = null;
          order.fulfilmentStatus = 'PARTIALLY_FULFILLED';
          hist(order, { type: 'FULFILMENT', from: 'UNFULFILLED', to: 'PARTIALLY_FULFILLED', ...staffActor('orders'), at: shipAt });
          setUpdated(shipAt);
        }
      }
      break;
    }
    case 'SHIPPED': {
      takePayment();
      const shippedAt = draft.shippedAt as Date;
      order.fulfilmentStatus = 'FULFILLED';
      order.status = 'SHIPPED';
      const elapsed = now.getTime() - shippedAt.getTime();
      const progress = 0.12 + rng.float() * 0.8;
      const status = progress < 0.25 ? 'PICKED_UP' : progress < 0.8 ? 'IN_TRANSIT' : 'OUT_FOR_DELIVERY';
      const shipment = ship(shippedAt, status, undefined, now);
      shipment.expectedDeliveryAt = addMs(shippedAt, Math.max(elapsed / progress, elapsed + 6 * MS_HOUR));
      hist(order, { type: 'FULFILMENT', from: 'UNFULFILLED', to: 'FULFILLED', ...staffActor('orders'), at: shippedAt });
      hist(order, { type: 'ORDER', from: 'CONFIRMED', to: 'SHIPPED', ...staffActor('orders'), at: shippedAt });
      setUpdated(now);
      break;
    }
    case 'CANCELLED_PENDING': {
      const abandoned = rng.chance(0.55);
      const cancelAt = addMs(order.createdAt, abandoned ? (30 + rng.float() * 90) * MS_MINUTE : (1 + rng.float() * 40) * MS_HOUR);
      const payment = makeOnlinePayment(abandoned ? 'EXPIRED' : 'CANCELLED');
      payment.updatedAt = cancelAt;
      order.status = 'CANCELLED';
      order.paymentStatus = 'VOIDED';
      order.cancelReason = abandoned ? 'Payment not completed' : rng.pick(CANCEL_REASONS_CUSTOMER);
      order.cancelledAt = cancelAt;
      order.releasedAt = cancelAt;
      order.lines.forEach((l) => (l.qtyCancelled = l.qty));
      hist(order, { type: 'ORDER', from: 'PENDING', to: 'CANCELLED', reason: order.cancelReason, actor: abandoned ? 'SYSTEM' : 'CUSTOMER', staffKey: null, at: cancelAt });
      setUpdated(cancelAt);
      break;
    }
    case 'CANCELLED_CONFIRMED': {
      const payment = takePayment();
      const cancelAt = addMs(confirmedAt as Date, (2 + rng.float() * 40) * MS_HOUR);
      order.status = 'CANCELLED';
      order.cancelReason = rng.pick([...CANCEL_REASONS_CUSTOMER, 'Out of stock at the warehouse', 'Customer requested cancellation by phone']);
      order.cancelledAt = cancelAt;
      order.cancelRestockAt = cancelAt;
      order.lines.forEach((l) => (l.qtyCancelled = l.qty));
      const byCustomer = CANCEL_REASONS_CUSTOMER.includes(order.cancelReason);
      hist(order, { type: 'ORDER', from: 'CONFIRMED', to: 'CANCELLED', reason: order.cancelReason, actor: byCustomer ? 'CUSTOMER' : 'USER', staffKey: byCustomer ? null : 'orders', at: cancelAt });
      if (online) {
        refundPayment(order, payment, total, addMs(cancelAt, (10 + rng.float() * 90) * MS_MINUTE), 'Order cancelled before dispatch', null, 1);
        order.paymentStatus = 'REFUNDED';
        hist(order, { type: 'PAYMENT', from: 'PAID', to: 'REFUNDED', actor: 'SYSTEM', staffKey: null, at: order.refunds[0]!.at });
        setUpdated(order.refunds[0]!.at);
      } else {
        payment.status = 'CANCELLED';
        payment.updatedAt = cancelAt;
        order.paymentStatus = 'VOIDED';
        setUpdated(cancelAt);
      }
      break;
    }
    case 'DELIVERED':
    case 'RETURN_COMPLETED':
    case 'RETURN_REJECTED':
    case 'RETURN_RECEIVED':
    case 'RETURN_APPROVED':
    case 'RETURN_REQUESTED': {
      const payment = takePayment();
      const shippedAt = addMs(confirmedAt as Date, (5 + rng.float() * 24) * MS_HOUR);
      const deliveredAt = addMs(shippedAt, (1.5 + rng.float() * 4) * MS_DAY);
      order.fulfilmentStatus = 'FULFILLED';
      order.status = 'DELIVERED';
      order.deliveredAt = deliveredAt;
      ship(shippedAt, 'DELIVERED', deliveredAt, now);
      hist(order, { type: 'FULFILMENT', from: 'UNFULFILLED', to: 'FULFILLED', ...staffActor('orders'), at: shippedAt });
      hist(order, { type: 'ORDER', from: 'CONFIRMED', to: 'SHIPPED', ...staffActor('orders'), at: shippedAt });
      hist(order, { type: 'ORDER', from: 'SHIPPED', to: 'DELIVERED', actor: 'SYSTEM', staffKey: null, at: deliveredAt });
      if (!online) {
        payment.status = 'CAPTURED';
        payment.capturedMinor = total;
        payment.capturedAt = deliveredAt;
        payment.updatedAt = deliveredAt;
        order.paymentStatus = 'PAID';
        order.amountPaidMinor = total;
        hist(order, { type: 'PAYMENT', from: 'PENDING', to: 'PAID', reason: 'Cash collected on delivery', actor: 'SYSTEM', staffKey: null, at: deliveredAt });
      }
      setUpdated(deliveredAt);

      // Close fully-settled, older orders.
      const ageDays = (now.getTime() - deliveredAt.getTime()) / MS_DAY;
      if (order.outcome === 'DELIVERED' && ageDays > 9 && rng.chance(0.65)) {
        const closedAt = addMs(deliveredAt, (1 + rng.float() * 6) * MS_DAY);
        if (closedAt.getTime() < now.getTime()) {
          order.status = 'COMPLETED';
          order.closedAt = closedAt;
          hist(order, { type: 'ORDER', from: 'DELIVERED', to: 'COMPLETED', ...staffActor('orders'), at: closedAt });
          setUpdated(closedAt);
        }
      }
      if (order.outcome !== 'DELIVERED') buildReturn(ctx, rng, order, payment, deliveredAt, env, setUpdated);
      break;
    }
    case 'RTO': {
      const payment = takePayment();
      const shippedAt = addMs(confirmedAt as Date, (5 + rng.float() * 24) * MS_HOUR);
      const rtoInitiated = addMs(shippedAt, (3 + rng.float() * 3) * MS_DAY);
      const rtoDelivered = addMs(rtoInitiated, (2 + rng.float() * 4) * MS_DAY);
      order.fulfilmentStatus = 'FULFILLED';
      const shipment = ship(shippedAt, 'RTO_DELIVERED', undefined, now);
      shipment.rtoInitiatedAt = rtoInitiated;
      shipment.updatedAt = rtoDelivered;
      shipment.events.push({ status: 'FAILED_DELIVERY', at: addMs(shippedAt, 3 * MS_DAY), location: order.address.city, description: 'Delivery attempt failed: customer unavailable' });
      shipment.events.push({ status: 'RTO_INITIATED', at: rtoInitiated, location: order.address.city, description: 'Return to origin initiated' });
      shipment.events.push({ status: 'RTO_DELIVERED', at: rtoDelivered, location: ORIGIN_PLACEHOLDER, description: 'Returned to the warehouse' });
      shipment.events.sort((a, b) => a.at.getTime() - b.at.getTime());
      hist(order, { type: 'FULFILMENT', from: 'UNFULFILLED', to: 'FULFILLED', ...staffActor('orders'), at: shippedAt });
      hist(order, { type: 'ORDER', from: 'CONFIRMED', to: 'SHIPPED', ...staffActor('orders'), at: shippedAt });
      order.lines.forEach((l) => (l.qtyFulfilled = 0)); // RTO restock reverts fulfilled quantity
      order.status = 'RETURNED';
      order.fulfilmentStatus = 'RETURNED';
      order.cancelRestockAt = null;
      order.rtoAt = rtoDelivered;
      hist(order, { type: 'ORDER', from: 'SHIPPED', to: 'RETURNED', reason: 'Return to origin: delivery failed', actor: 'SYSTEM', staffKey: null, at: rtoDelivered });
      hist(order, { type: 'FULFILMENT', from: 'FULFILLED', to: 'RETURNED', actor: 'SYSTEM', staffKey: null, at: rtoDelivered });
      if (online) {
        refundPayment(order, payment, total, addMs(rtoDelivered, (1 + rng.float() * 2) * MS_DAY), 'Return to origin: full refund', null, 1);
        order.paymentStatus = 'REFUNDED';
        hist(order, { type: 'PAYMENT', from: 'PAID', to: 'REFUNDED', actor: 'SYSTEM', staffKey: null, at: order.refunds[0]!.at });
        setUpdated(order.refunds[0]!.at);
      } else {
        payment.status = 'CANCELLED';
        payment.updatedAt = rtoDelivered;
        order.paymentStatus = 'VOIDED';
        setUpdated(rtoDelivered);
      }
      setUpdated(rtoDelivered);
      break;
    }
    default:
      break;
  }

  if (order.status === 'PENDING') order.updatedAt = order.payments[0]?.updatedAt ?? order.createdAt;
}

function buildReturn(ctx: Ctx, rng: Rng, order: OrderModel, payment: PaymentModel, deliveredAt: Date, env: LifeEnv, setUpdated: (at: Date) => void): void {
  const status = ((): ReturnModel['status'] => {
    switch (order.outcome) {
      case 'RETURN_COMPLETED': return 'COMPLETED';
      case 'RETURN_REJECTED': return 'REJECTED';
      case 'RETURN_RECEIVED': return 'RECEIVED';
      case 'RETURN_APPROVED': return 'APPROVED';
      default: return 'REQUESTED';
    }
  })();

  // Which lines come back: the whole order for single-line orders, otherwise one line.
  const returnLines = order.lines.length === 1 ? [order.lines[0]!] : [rng.pick(order.lines)];
  const reasonPick = rng.pick(RETURN_REASONS);
  let stamp = addMs(deliveredAt, (1 + rng.float() * 6) * MS_DAY).getTime();
  let rma = `RMA-${base36Stamp(new Date(stamp))}`;
  while (env.usedRma.has(rma)) { stamp += 1; rma = `RMA-${base36Stamp(new Date(stamp))}`; }
  env.usedRma.add(rma);
  const createdAt = new Date(stamp);

  const items = returnLines.map((line) => {
    const qty = line.qty;
    return { line, qty, restock: true, refundMinor: null as number | null, note: reasonPick.reason === 'DAMAGED' ? 'Outer carton damaged' : 'Unused, original packaging' };
  });

  const ret: ReturnModel = {
    rma,
    status,
    reason: reasonPick.reason,
    reasonDetail: reasonPick.detail,
    createdAt,
    approvedAt: null,
    receivedAt: null,
    inspectedAt: null,
    completedAt: null,
    inspection: null,
    rejectedReason: null,
    refundMinor: null,
    restockingFeeMinor: 0,
    items,
  };

  if (status === 'REJECTED') {
    ret.rejectedReason = 'Return window requirements not met: the item shows signs of use.';
    setUpdated(createdAt);
  } else if (status !== 'REQUESTED') {
    ret.approvedAt = addMs(createdAt, (6 + rng.float() * 30) * MS_HOUR);
    setUpdated(ret.approvedAt);
  }
  if (status === 'RECEIVED' || status === 'COMPLETED') {
    ret.receivedAt = addMs(ret.approvedAt as Date, (3 + rng.float() * 4) * MS_DAY);
    setUpdated(ret.receivedAt);
  }
  if (status === 'COMPLETED') {
    ret.inspectedAt = addMs(ret.receivedAt as Date, (1 + rng.float()) * MS_DAY);
    ret.completedAt = addMs(ret.inspectedAt, (4 + rng.float() * 20) * MS_HOUR);
    ret.inspection = rng.chance(0.8) ? 'RESELLABLE' : rng.chance(0.7) ? 'DAMAGED' : 'SCRAP';
    const fee = reasonPick.reason === 'CHANGED_MIND' ? Math.round(items.reduce((s, i) => s + i.line.totalMinor, 0) * 0.05) : 0;
    let refundTotal = 0;
    for (const item of items) {
      const line = item.line;
      item.refundMinor = Math.round((line.totalMinor / line.qty) * item.qty);
      item.restock = ret.inspection === 'RESELLABLE';
      line.qtyReturned += item.qty;
      refundTotal += item.refundMinor;
    }
    ret.restockingFeeMinor = fee;
    ret.refundMinor = refundTotal - fee;
    // Money goes back to the customer.
    refundPayment(order, payment, ret.refundMinor, ret.completedAt, `Return ${rma} refunded`, rma, 1);
    order.paymentStatus = order.amountRefundedMinor >= order.amountPaidMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    const allReturned = order.lines.every((l) => l.qtyReturned >= l.qty);
    order.fulfilmentStatus = allReturned ? 'RETURNED' : 'PARTIALLY_RETURNED';
    hist(order, { type: 'PAYMENT', from: 'PAID', to: order.paymentStatus, reason: `Refund for ${rma}`, actor: 'USER', staffKey: 'orders', at: ret.completedAt });
    setUpdated(ret.completedAt);
  }
  order.returns.push(ret);
}
