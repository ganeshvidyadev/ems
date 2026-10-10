import { addMs, MS_DAY, MS_HOUR } from '../dates';
import { addressIn, CITIES, type City, fictionalPhone, personName, pickCity } from '../people';
import { Ref } from '../types';
import { type Ctx, CUSTOMER_PASSWORD_PLACEHOLDER } from './context';
import type { CoreModel } from './core';

export const CUSTOMER_COUNT = 100;

export interface AddressModel {
  label: string;
  type: 'BOTH' | 'SHIPPING';
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  stateCode: string;
  stateName: string;
  postalCode: string;
  isDefault: boolean;
}

export interface CustomerModel {
  index: number;
  first: string;
  last: string;
  gender: 'MALE' | 'FEMALE';
  email: string;
  emailNormalized: string;
  phone: string;
  addresses: AddressModel[];
  homeCity: City;
  isGuest: boolean;
  status: 'ACTIVE' | 'BLOCKED' | 'DEACTIVATED';
  acceptsMarketing: boolean;
  dateOfBirth: string | null;
  /** Relative weight when assigning orders. */
  activity: number;
  // Filled from orders.
  createdAt: Date;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  totalOrders: number;
  totalSpentMinor: number;
  loyaltyPoints: number;
  tags: string[];
  group: string | null;
}

export function buildCustomers(ctx: Ctx, core: CoreModel): CustomerModel[] {
  const customers: CustomerModel[] = [];
  const usedPhones = new Set<string>();
  const usedEmails = new Set<string>();

  for (let i = 1; i <= CUSTOMER_COUNT; i += 1) {
    const rng = ctx.rng('customer', i);
    const person = personName(rng);
    const nn = String(i).padStart(2, '0');
    const base = `${person.first}.${person.last}`.toLowerCase().replace(/[^a-z.]/g, '');
    let email = `${base}${nn}@example.test`;
    if (usedEmails.has(email)) email = `${base}${nn}x@example.test`;
    usedEmails.add(email);

    let phone = fictionalPhone(rng);
    while (usedPhones.has(phone)) phone = fictionalPhone(rng);
    usedPhones.add(phone);

    const homeCity = pickCity(rng, core.homeStateCode, ctx.spec.homeStateShare);
    const addressCountRoll = rng.float();
    const addressCount = addressCountRoll < 0.45 ? 1 : addressCountRoll < 0.83 ? 2 : 3;
    const recipient = `${person.first} ${person.last}`;
    const addresses: AddressModel[] = [];
    for (let a = 0; a < addressCount; a += 1) {
      const city = a === 2 && rng.chance(0.6) ? rng.pick(CITIES) : homeCity;
      const addr = addressIn(city, rng);
      addresses.push({
        label: a === 0 ? 'Home' : a === 1 ? 'Office' : "Parents' home",
        type: a === 0 ? 'BOTH' : 'SHIPPING',
        recipientName: a === 2 ? `${personName(rng).first} ${person.last}` : recipient,
        phone,
        ...addr,
        isDefault: a === 0,
      });
    }

    const dobRoll = rng.chance(0.4);
    const age = rng.int(20, 62);
    const dob = dobRoll ? `${2026 - age}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}` : null;

    customers.push({
      index: i,
      first: person.first,
      last: person.last,
      gender: person.gender,
      email,
      emailNormalized: email.toLowerCase(),
      phone,
      addresses,
      homeCity,
      isGuest: false,
      status: 'ACTIVE',
      acceptsMarketing: rng.chance(0.55),
      dateOfBirth: dob,
      activity: 1 / Math.pow(rng.int(1, 100), 0.7),
      createdAt: ctx.historyStart,
      firstOrderAt: null,
      lastOrderAt: null,
      totalOrders: 0,
      totalSpentMinor: 0,
      loyaltyPoints: 0,
      tags: [],
      group: null,
    });
  }
  return customers;
}

/** Emits customer, address and (optionally) wishlist rows with their final order statistics. */
export function emitCustomerRows(ctx: Ctx, customers: CustomerModel[]): void {
  const { sink, spec } = ctx;
  const storeRef = new Ref('stores', `${spec.slug}-store`);
  for (const c of customers) {
    const rng = ctx.rng('customer-emit', c.index);
    const verifiedAt = c.isGuest ? null : addMs(c.createdAt, rng.int(1, 30) * 60_000);
    sink.add('customers', {
      nk: c.emailNormalized,
      ts: c.createdAt,
      updatedAt: c.lastOrderAt ?? c.createdAt,
      v: {
        store_id: storeRef,
        email: c.email,
        email_normalized: c.emailNormalized,
        phone_e164: c.phone,
        password_hash: c.isGuest ? null : CUSTOMER_PASSWORD_PLACEHOLDER,
        first_name: c.first,
        last_name: c.last,
        date_of_birth: c.dateOfBirth,
        gender: c.gender,
        status: c.status,
        is_guest: c.isGuest ? 1 : 0,
        email_verified_at: verifiedAt,
        phone_verified_at: c.isGuest ? null : addMs(c.createdAt, 2 * MS_HOUR),
        accepts_marketing: c.acceptsMarketing ? 1 : 0,
        marketing_consent_at: c.acceptsMarketing ? c.createdAt : null,
        default_address_id: null,
        customer_group: c.group,
        tax_exempt: 0,
        tax_registration: null,
        loyalty_points: c.loyaltyPoints,
        total_orders: c.totalOrders,
        total_spent_minor: c.totalSpentMinor,
        average_order_minor: c.totalOrders > 0 ? Math.floor(c.totalSpentMinor / c.totalOrders) : 0,
        first_order_at: c.firstOrderAt,
        last_order_at: c.lastOrderAt,
        notes: null,
        tags: c.tags.length > 0 ? c.tags : null,
      },
    });
    c.addresses.forEach((a, n) => {
      sink.add('customer_addresses', {
        nk: `${c.emailNormalized}|${n + 1}`,
        ts: new Date(Math.min(addMs(c.createdAt, (n + 1) * MS_DAY * 3).getTime(), ctx.now.getTime() - MS_HOUR)),
        owner: new Ref('customers', c.emailNormalized),
        v: {
          customer_id: new Ref('customers', c.emailNormalized),
          label: a.label,
          type: a.type,
          recipient_name: a.recipientName,
          phone_e164: a.phone,
          address_line1: a.addressLine1,
          address_line2: a.addressLine2,
          landmark: a.landmark,
          city: a.city,
          state_code: a.stateCode,
          state_name: a.stateName,
          postal_code: a.postalCode,
          country_code: 'IN',
          latitude: null,
          longitude: null,
          is_default_shipping: a.isDefault ? 1 : 0,
          is_default_billing: a.isDefault ? 1 : 0,
        },
      });
    });
  }
}
