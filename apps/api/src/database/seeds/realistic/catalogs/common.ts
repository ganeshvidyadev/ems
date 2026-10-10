import type { CouponSpec, VariantAxis, VariantAxisValue } from '../types';

/** Builds a variant axis whose option codes are derived from the labels. */
export function axis(
  name: string,
  labels: (string | [label: string, delta: number] | [label: string, delta: number, mult: number])[],
  code?: (label: string) => string,
): VariantAxis {
  const values: VariantAxisValue[] = labels.map((entry) => {
    const [label, delta, mult] = Array.isArray(entry) ? (entry as [string, number, number?]) : [entry, 0, 1];
    const derived = code ? code(label) : label.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
    return { label, code: derived, priceDelta: delta, priceMult: mult ?? 1 };
  });
  return { name, values };
}

/** Pack-size axis: each entry is [label, price multiplier]. */
export const packAxis = (entries: [label: string, mult: number][]): VariantAxis =>
  axis('Pack size', entries.map(([l, m]) => [l, 0, m] as [string, number, number]), (l) => l.replace(/[^A-Za-z0-9]/g, '').toUpperCase());

export const colourAxis = (labels: string[]): VariantAxis => axis('Colour', labels);

export const sizeAxis = (labels: string[], deltas: number[] = []): VariantAxis =>
  axis('Size', labels.map((l, i) => [l, deltas[i] ?? 0] as [string, number]), (l) => l.replace(/[^A-Za-z0-9]/g, '').toUpperCase());

export const STAFF_TEMPLATE = (names: [string, string][]): { key: string; first: string; last: string; roles: string[] }[] => [
  { key: 'owner', first: names[0]![0], last: names[0]![1], roles: ['STORE_OWNER'] },
  { key: 'admin', first: names[1]![0], last: names[1]![1], roles: ['STORE_ADMIN'] },
  { key: 'catalog', first: names[2]![0], last: names[2]![1], roles: ['PRODUCT_MANAGER'] },
  { key: 'stock', first: names[3]![0], last: names[3]![1], roles: ['INVENTORY_MANAGER'] },
  { key: 'orders', first: names[4]![0], last: names[4]![1], roles: ['ORDER_MANAGER', 'CUSTOMER_SUPPORT'] },
  { key: 'growth', first: names[5]![0], last: names[5]![1], roles: ['MARKETING_MANAGER'] },
];

/** The coupon shapes every tenant gets, with tenant-specific codes layered on top. */
export function standardCoupons(prefix: string, opts: { bigOrderRupees: number; freeShipMin: number }): CouponSpec[] {
  return [
    { code: `${prefix}WELCOME10`, name: 'Welcome 10% off', description: 'Ten percent off your order.', type: 'PERCENTAGE', value: 10, maxDiscountRupees: 500, minOrderRupees: 499, usageLimitPerCustomer: 1, usageLimitTotal: 400, startDaysAgo: 200, weight: 5 },
    { code: `${prefix}SAVE15`, name: 'Save 15%', description: 'Fifteen percent off on larger baskets.', type: 'PERCENTAGE', value: 15, maxDiscountRupees: 1500, minOrderRupees: opts.bigOrderRupees, usageLimitTotal: 250, usageLimitPerCustomer: 2, startDaysAgo: 120, weight: 3 },
    { code: `${prefix}FLAT200`, name: 'Flat Rs 200 off', description: 'Flat Rs 200 off on orders above the minimum.', type: 'FIXED_AMOUNT', value: 200, minOrderRupees: Math.round(opts.bigOrderRupees / 2), usageLimitTotal: 300, usageLimitPerCustomer: 3, startDaysAgo: 150, weight: 4 },
    { code: `${prefix}FREESHIP`, name: 'Free delivery', description: 'Free standard delivery.', type: 'FREE_SHIPPING', value: 0, minOrderRupees: opts.freeShipMin, usageLimitPerCustomer: 5, startDaysAgo: 170, weight: 3 },
    { code: `${prefix}FESTIVE20`, name: 'Festive sale 20%', description: 'Festive season sale: 20% off, capped.', type: 'PERCENTAGE', value: 20, maxDiscountRupees: 2500, minOrderRupees: opts.bigOrderRupees, usageLimitTotal: 12, usageLimitPerCustomer: 1, startDaysAgo: 18, weight: 4 },
    { code: `${prefix}INDEP15`, name: 'Independence Day 15%', description: 'Independence Day sale (ended).', type: 'PERCENTAGE', value: 15, maxDiscountRupees: 1200, minOrderRupees: 999, usageLimitTotal: 120, usageLimitPerCustomer: 1, startDaysAgo: 62, endDaysAgo: 55, weight: 3 },
    { code: `${prefix}MONSOON`, name: 'Monsoon bonanza', description: 'Monsoon season offer (ended).', type: 'FIXED_AMOUNT', value: 150, minOrderRupees: 799, usageLimitTotal: 80, usageLimitPerCustomer: 1, startDaysAgo: 120, endDaysAgo: 90, weight: 2 },
    { code: `${prefix}LOYAL5`, name: 'Loyalty 5%', description: 'A thank-you for repeat customers.', type: 'PERCENTAGE', value: 5, maxDiscountRupees: 300, usageLimitPerCustomer: 4, startDaysAgo: 90, weight: 2 },
    { code: `${prefix}OLDSALE`, name: 'Retired spring sale', description: 'Archived campaign.', type: 'PERCENTAGE', value: 12, minOrderRupees: 599, startDaysAgo: 210, endDaysAgo: 170, weight: 0, status: 'ARCHIVED' },
  ];
}
