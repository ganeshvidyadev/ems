import { addMs, dayString, MS_DAY, MS_HOUR } from '../dates';
import { hexFrom, sha256Hex, type Rng } from '../rng';
import { Ref } from '../types';
import type { CatalogModel, ProductModel } from './catalog';
import { type Ctx, rupeesToMinor, staffEmail } from './context';
import type { CustomerModel } from './customers';
import type { CouponModel, OrderModel } from './order-types';

/** Order statuses that count as a real sale in reports (same set as the sales rollup job). */
export const COUNTED_STATUSES = new Set(['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'RETURNED']);

const POSITIVE_TITLES = ['Worth every rupee', 'Exactly as described', 'Great quality', 'Very happy with this', 'Excellent value', 'Highly recommended', 'Superb', 'Better than expected'];
const NEUTRAL_TITLES = ['Decent for the price', 'Good, but could be better', 'Okay overall', 'Average experience', 'Fine for everyday use'];
const NEGATIVE_TITLES = ['Not as expected', 'Disappointed', 'Could be much better', 'Quality issues', 'Would not buy again'];
const POSITIVE_BODIES = [
  'Arrived on time and the {noun} looks and feels just like the pictures. Happy with the purchase.',
  'Good quality for the price. Packaging was neat and delivery was quicker than I expected.',
  'I have been using this {noun} for a few weeks now and it works perfectly.',
  'Really pleased. It matches the description and the finish is great.',
  'Excellent value for money. My family loved it and I will order again.',
  'Fast delivery, secure packing and the product is exactly what I wanted.',
];
const NEUTRAL_BODIES = [
  'The {noun} is fine for the price, though the finish could be better.',
  'Does the job. Delivery took a little longer than promised but the product is okay.',
  'Average quality. It works, but I expected slightly more for this price.',
];
const NEGATIVE_BODIES = [
  'The {noun} did not meet my expectations. The quality is below what the pictures suggest.',
  'Had an issue with this item and support took a while to respond. Not very satisfied.',
  'Packaging was fine but the product looks different from the photos.',
];
const MERCHANT_REPLIES = [
  'Thank you for the feedback. We are sorry this fell short; please write to our support team so we can make it right.',
  'We appreciate you taking the time to review this. Our team has noted your comments for the supplier.',
  'Sorry about the experience. A support executive will contact you to resolve this.',
];

function reviewText(rng: Rng, rating: number, noun: string): { title: string; body: string } {
  const [titles, bodies] = rating >= 4 ? [POSITIVE_TITLES, POSITIVE_BODIES] : rating === 3 ? [NEUTRAL_TITLES, NEUTRAL_BODIES] : [NEGATIVE_TITLES, NEGATIVE_BODIES];
  return { title: rng.pick(titles), body: rng.pick(bodies).replace('{noun}', noun) };
}

/**
 * Derives every aggregate that the application keeps denormalised (customer order stats, product
 * sold counts and ratings, loyalty balances) and emits coupon, gift-card, redemption, review,
 * loyalty, wishlist and daily-rollup rows. Mutates the models so that parent rows are emitted
 * with their final values and never need an UPDATE.
 */
export function finalizeCommerce(ctx: Ctx, orders: OrderModel[], coupons: CouponModel[], customers: CustomerModel[], catalog: CatalogModel): void {
  const { sink, spec } = ctx;
  const storeRef = new Ref('stores', `${spec.slug}-store`);

  // --- Customer statistics, lifecycle dates, flags -----------------------------------------------
  const byCustomer = new Map<number, OrderModel[]>();
  for (const o of orders) {
    const list = byCustomer.get(o.customer.index) ?? [];
    list.push(o);
    byCustomer.set(o.customer.index, list);
  }
  const flagRng = ctx.rng('customer-flags');
  const orderless = customers.filter((c) => !byCustomer.has(c.index));
  const oneOrder = customers.filter((c) => (byCustomer.get(c.index)?.length ?? 0) === 1);
  flagRng.shuffle(oneOrder).slice(0, 3).forEach((c) => (c.isGuest = true));
  const quiet = flagRng.shuffle(orderless);
  if (quiet[0]) quiet[0].status = 'BLOCKED';
  if (quiet[1]) quiet[1].status = 'DEACTIVATED';

  for (const c of customers) {
    const rng = ctx.rng('customer-dates', c.index);
    const mine = (byCustomer.get(c.index) ?? []).slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const counted = mine.filter((o) => COUNTED_STATUSES.has(o.status) || o.status === 'ON_HOLD');
    if (mine.length > 0) {
      c.createdAt = addMs(mine[0]!.createdAt, -(0.3 + rng.float() * 45) * MS_DAY);
      if (c.createdAt.getTime() < ctx.tenantCreatedAt.getTime() + MS_DAY) c.createdAt = addMs(ctx.tenantCreatedAt, MS_DAY + rng.int(0, 5) * MS_HOUR);
    } else {
      c.createdAt = addMs(ctx.historyStart, rng.float() * 170 * MS_DAY);
    }
    c.totalOrders = counted.length;
    c.totalSpentMinor = counted.reduce((s, o) => s + o.totalMinor - o.amountRefundedMinor, 0);
    c.firstOrderAt = counted.length > 0 ? (counted[0]!.confirmedAt ?? counted[0]!.createdAt) : null;
    c.lastOrderAt = counted.length > 0 ? (counted[counted.length - 1]!.confirmedAt ?? counted[counted.length - 1]!.createdAt) : null;
  }
  [...customers].sort((a, b) => b.totalSpentMinor - a.totalSpentMinor).slice(0, 8).filter((c) => c.totalSpentMinor > 0).forEach((c) => {
    c.tags.push('vip');
    c.group = 'VIP';
  });
  for (const c of customers) {
    if (c.totalOrders >= 3) c.tags.push('repeat-buyer');
    if (c.acceptsMarketing) c.tags.push('newsletter');
    if (c.isGuest) c.tags.push('guest-checkout');
  }

  // --- Product sold counts ------------------------------------------------------------------------
  for (const o of orders) {
    if (!['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(o.status)) continue;
    for (const l of o.lines) l.product.totalSold += l.qty;
  }

  // --- Loyalty ledger --------------------------------------------------------------------------------
  interface LedgerEntry { at: Date; type: 'EARN' | 'REDEEM' | 'ADJUST' | 'REVERSAL'; points: number; order: OrderModel | null; description: string; expires: Date | null }
  for (const c of customers) {
    if (c.isGuest || c.status !== 'ACTIVE') continue;
    const rng = ctx.rng('loyalty', c.index);
    const entries: LedgerEntry[] = [];
    if (rng.chance(0.6)) entries.push({ at: addMs(c.createdAt, 3 * MS_HOUR), type: 'ADJUST', points: 50, order: null, description: 'Welcome bonus', expires: null });
    for (const o of byCustomer.get(c.index) ?? []) {
      if (o.status !== 'DELIVERED' && o.status !== 'COMPLETED') continue;
      const points = Math.floor((o.subtotalMinor - o.discountMinor) / 10_000);
      if (points <= 0 || !o.deliveredAt) continue;
      entries.push({ at: o.deliveredAt, type: 'EARN', points, order: o, description: `Reward points for order ${o.number}`, expires: addMs(o.deliveredAt, 365 * MS_DAY) });
      const ret = o.returns.find((r) => r.status === 'COMPLETED');
      if (ret?.completedAt && o.amountPaidMinor > 0) {
        const reversed = Math.min(points, Math.floor(points * ((ret.refundMinor ?? 0) / Math.max(1, o.amountPaidMinor))) + 1);
        entries.push({ at: ret.completedAt, type: 'REVERSAL', points: -reversed, order: o, description: `Reversal of EARN for return ${ret.rma}`, expires: null });
      }
    }
    entries.sort((a, b) => a.at.getTime() - b.at.getTime());
    let balance = 0;
    const final: (LedgerEntry & { after: number })[] = [];
    for (const e of entries) {
      if (balance + e.points < 0) e.points = -balance; // never negative
      if (e.points === 0) continue;
      balance += e.points;
      final.push({ ...e, after: balance });
    }
    if (balance >= 250 && rng.chance(0.6)) {
      const last = final[final.length - 1]!;
      const at = addMs(last.at, (2 + rng.float() * 20) * MS_DAY);
      if (at.getTime() < ctx.now.getTime()) {
        balance -= 200;
        final.push({ at, type: 'REDEEM', points: -200, order: null, description: 'Redeemed for a store voucher', expires: null, after: balance });
      }
    }
    c.loyaltyPoints = balance;
    final.forEach((e, n) => {
      sink.add('loyalty_transactions', {
        nk: `${c.emailNormalized}|${n + 1}`,
        ts: e.at,
        owner: new Ref('customers', c.emailNormalized),
        v: {
          customer_id: new Ref('customers', c.emailNormalized),
          type: e.type,
          points_delta: e.points,
          points_after: e.after,
          order_id: e.order ? new Ref('orders', e.order.number) : null,
          description: e.description,
          expires_at: e.expires,
          created_by: null,
        },
      });
    });
  }

  // --- Reviews -------------------------------------------------------------------------------------
  for (const o of orders) {
    if ((o.status !== 'DELIVERED' && o.status !== 'COMPLETED') || !o.deliveredAt) continue;
    const c = o.customer;
    if (c.isGuest) continue;
    const returned = o.returns.length > 0;
    for (const line of o.lines) {
      const rng = ctx.rng('review', line.itemNk);
      if (!rng.chance(returned ? 0.55 : 0.33)) continue;
      const at = addMs(o.deliveredAt, (2 + rng.float() * 18) * MS_DAY);
      if (at.getTime() > ctx.now.getTime()) continue;
      const rating = returned
        ? rng.weighted([[1, 15], [2, 30], [3, 30], [4, 18], [5, 7]] as const)
        : rng.weighted([[5, 46], [4, 30], [3, 14], [2, 6], [1, 4]] as const);
      let status: string = rng.weighted([['APPROVED', 88], ['PENDING', 8], ['REJECTED', 3], ['SPAM', 1]] as const);
      const { title, body } = reviewText(rng, rating, spec.reviewNoun);
      const replied = status === 'APPROVED' && rating <= 3 && rng.chance(0.4);
      let moderatedAt: Date | null = status === 'PENDING' ? null : addMs(at, (3 + rng.float() * 30) * MS_HOUR);
      // A review cannot have been moderated in the future: it simply is still awaiting moderation.
      if (moderatedAt && moderatedAt.getTime() > ctx.now.getTime()) {
        moderatedAt = null;
        status = 'PENDING';
      }
      sink.add('reviews', {
        nk: line.itemNk,
        ts: at,
        owner: new Ref('orders', o.number),
        v: {
          store_id: storeRef,
          product_id: new Ref('products', line.product.slug),
          customer_id: new Ref('customers', c.emailNormalized),
          order_item_id: new Ref('order_items', line.itemNk),
          rating,
          title,
          body,
          author_name: `${c.first} ${c.last.charAt(0)}.`,
          images: null,
          status,
          is_verified_purchase: 1,
          helpful_count: status === 'APPROVED' ? rng.int(0, rating >= 4 ? 18 : 6) : 0,
          merchant_reply: replied && moderatedAt && addMs(moderatedAt, 6 * MS_HOUR).getTime() <= ctx.now.getTime() ? rng.pick(MERCHANT_REPLIES) : null,
          merchant_replied_at: replied && moderatedAt && addMs(moderatedAt, 6 * MS_HOUR).getTime() <= ctx.now.getTime() ? addMs(moderatedAt, 6 * MS_HOUR) : null,
          moderated_by: moderatedAt ? new Ref('users', staffEmail(spec, 'admin').toLowerCase()) : null,
          moderated_at: moderatedAt,
        },
      });
      if (status === 'APPROVED') {
        line.product.ratingSum += rating;
        line.product.ratingCount += 1;
      }
    }
  }
  // --- Wishlist ---------------------------------------------------------------------------------------
  const activeProducts = catalog.products.filter((p) => p.status === 'ACTIVE');
  for (const c of customers) {
    if (c.isGuest || c.status !== 'ACTIVE') continue;
    const rng = ctx.rng('wishlist', c.index);
    if (!rng.chance(0.6)) continue;
    const picks = rng.shuffle(activeProducts).slice(0, rng.int(1, 5));
    picks.forEach((p: ProductModel) => {
      const variant = p.type === 'VARIABLE' ? rng.pick(p.variants) : null;
      const at = addMs(c.createdAt, rng.float() * Math.max(1, ctx.now.getTime() - c.createdAt.getTime() - MS_DAY));
      sink.add('wishlist_items', {
        nk: `${c.emailNormalized}|${p.slug}|${variant?.sku ?? ''}`,
        ts: at,
        owner: new Ref('customers', c.emailNormalized),
        v: {
          customer_id: new Ref('customers', c.emailNormalized),
          product_id: new Ref('products', p.slug),
          variant_id: variant ? new Ref('product_variants', variant.sku) : null,
          added_at: at,
        },
      });
    });
  }

  // --- Coupons and redemptions ---------------------------------------------------------------------
  for (const c of coupons) {
    const s = c.spec;
    sink.add('coupons', {
      nk: c.code,
      ts: new Date(Math.max(ctx.tenantCreatedAt.getTime() + MS_DAY, c.startsAt.getTime() - MS_DAY)),
      v: {
        store_id: storeRef,
        code: c.code,
        name: s.name,
        description: s.description,
        discount_type: s.type,
        discount_value: s.type === 'FIXED_AMOUNT' ? `${rupeesToMinor(s.value)}.0000` : `${s.value}.0000`,
        max_discount_minor: s.maxDiscountRupees ? rupeesToMinor(s.maxDiscountRupees) : null,
        min_order_minor: s.minOrderRupees ? rupeesToMinor(s.minOrderRupees) : null,
        applies_to: s.type === 'FREE_SHIPPING' ? 'SHIPPING' : 'ORDER',
        target_ids: null,
        excluded_ids: null,
        buy_quantity: null,
        get_quantity: null,
        usage_limit_total: s.usageLimitTotal ?? null,
        usage_limit_per_customer: s.usageLimitPerCustomer ?? null,
        usage_count: c.usageCount,
        customer_eligibility: 'ALL',
        eligible_customer_ids: null,
        eligible_group: null,
        combinable: 0,
        auto_apply: 0,
        starts_at: c.startsAt,
        ends_at: c.endsAt,
        status: s.status ?? 'ACTIVE',
        created_by: null,
      },
    });
  }
  for (const o of orders) {
    if (!o.coupon || !o.redeemsCoupon) continue;
    sink.add('coupon_redemptions', {
      nk: o.number,
      ts: o.createdAt,
      owner: new Ref('orders', o.number),
      v: {
        coupon_id: new Ref('coupons', o.coupon.code),
        order_id: new Ref('orders', o.number),
        customer_id: new Ref('customers', o.customer.emailNormalized),
        discount_minor: o.discountMinor,
        redeemed_at: o.createdAt,
      },
    });
  }

  // --- Gift cards ------------------------------------------------------------------------------------
  const gcRng = ctx.rng('giftcards');
  const gcPlan: { value: number; kind: 'ACTIVE' | 'PARTIAL' | 'DEPLETED' | 'EXPIRED' | 'DISABLED' }[] = [
    { value: 500, kind: 'ACTIVE' }, { value: 1000, kind: 'ACTIVE' }, { value: 2000, kind: 'ACTIVE' }, { value: 5000, kind: 'ACTIVE' },
    { value: 1000, kind: 'PARTIAL' }, { value: 500, kind: 'DEPLETED' }, { value: 2000, kind: 'EXPIRED' }, { value: 1000, kind: 'DISABLED' },
  ];
  const holders = gcRng.shuffle(customers.filter((c) => c.status === 'ACTIVE' && !c.isGuest));
  gcPlan.forEach((g, i) => {
    const code = `${spec.tag}${hexFrom(`${spec.slug}|gc|${i}`, 1).toUpperCase()}-${hexFrom(`${spec.slug}|gc|${i}|a`, 4).toUpperCase()}-${hexFrom(`${spec.slug}|gc|${i}|b`, 4).toUpperCase()}`;
    const initial = rupeesToMinor(g.value);
    const issuedAt = addMs(ctx.now, -(20 + i * 17 + gcRng.int(0, 10)) * MS_DAY);
    const balance = g.kind === 'DEPLETED' ? 0 : g.kind === 'PARTIAL' ? Math.round(initial * 0.6) : initial;
    const holder = i % 2 === 0 ? holders[i] : undefined;
    sink.add('gift_cards', {
      nk: sha256Hex(code),
      ts: issuedAt,
      v: {
        code_hash: sha256Hex(code),
        code_last4: code.slice(-4),
        initial_value_minor: initial,
        balance_minor: balance,
        currency: 'INR',
        status: g.kind === 'PARTIAL' ? 'ACTIVE' : g.kind,
        issued_to_customer_id: holder ? new Ref('customers', holder.emailNormalized) : null,
        issued_to_email: holder ? holder.email : null,
        order_id: null,
        expires_at: g.kind === 'EXPIRED' ? addMs(ctx.now, -5 * MS_DAY) : addMs(issuedAt, 365 * MS_DAY),
      },
    });
    ctx.giftCardCodes.push({ code, initialMinor: String(initial), status: g.kind });
  });

  // --- Daily sales rollup (same definitions as SalesRollupService) -------------------------------------
  interface Bucket { orders: number; items: number; gross: number; discount: number; tax: number; shipping: number; refund: number; net: number; cogs: number; newC: number; retC: number; cancelled: number; }
  const empty = (): Bucket => ({ orders: 0, items: 0, gross: 0, discount: 0, tax: 0, shipping: 0, refund: 0, net: 0, cogs: 0, newC: 0, retC: 0, cancelled: 0 });
  const days = new Map<string, Bucket>();
  const day = (d: Date): Bucket => {
    const key = dayString(d);
    let b = days.get(key);
    if (!b) { b = empty(); days.set(key, b); }
    return b;
  };
  const firstOrderDay = new Map<number, string>();
  for (const c of customers) if (c.firstOrderAt) firstOrderDay.set(c.index, dayString(c.firstOrderAt));
  const seenNew = new Map<string, Set<number>>();
  const seenRet = new Map<string, Set<number>>();
  for (const o of orders) {
    if (COUNTED_STATUSES.has(o.status) && o.confirmedAt) {
      const b = day(o.confirmedAt);
      b.orders += 1;
      b.items += o.lines.reduce((s, l) => s + l.qty, 0);
      b.gross += o.subtotalMinor;
      b.discount += o.discountMinor;
      b.tax += o.taxMinor;
      b.shipping += o.shippingMinor;
      b.net += o.totalMinor;
      b.cogs += o.lines.reduce((s, l) => s + l.qty * l.costMinor, 0);
      const key = dayString(o.confirmedAt);
      const first = firstOrderDay.get(o.customer.index);
      if (first === key) {
        const set = seenNew.get(key) ?? new Set<number>();
        set.add(o.customer.index);
        seenNew.set(key, set);
      } else if (first && first < key) {
        const set = seenRet.get(key) ?? new Set<number>();
        set.add(o.customer.index);
        seenRet.set(key, set);
      }
    }
    if (o.cancelledAt) day(o.cancelledAt).cancelled += 1;
    for (const r of o.returns) {
      if (r.status === 'COMPLETED' && r.completedAt) {
        const b = day(r.completedAt);
        b.refund += r.refundMinor ?? 0;
        b.net -= r.refundMinor ?? 0;
      }
    }
  }
  for (const [key, b] of days) {
    b.newC = seenNew.get(key)?.size ?? 0;
    b.retC = seenRet.get(key)?.size ?? 0;
  }
  for (const [key, b] of [...days.entries()].sort(([a], [z]) => a.localeCompare(z))) {
    const updated = new Date(Math.min(ctx.now.getTime(), addMs(new Date(`${key}T00:00:00Z`), MS_DAY + 30 * 60_000).getTime()));
    for (const channel of ['WEB', 'ALL']) {
      sink.add('daily_sales_rollup', {
        nk: `${key}|${channel}`,
        ts: updated,
        v: {
          store_id: storeRef,
          date: key,
          channel,
          orders_count: b.orders,
          items_count: b.items,
          gross_minor: b.gross,
          discount_minor: b.discount,
          tax_minor: b.tax,
          shipping_minor: b.shipping,
          refund_minor: b.refund,
          net_minor: b.net,
          cogs_minor: b.cogs,
          new_customers: b.newC,
          returning_customers: b.retC,
          cancelled_count: b.cancelled,
        },
      });
    }
  }
}
