import type { DataSource } from 'typeorm';
import { PlanEntity, PlanLimitEntity, UNLIMITED, type PlanLimitKey } from '../entities/plan.entity';

/**
 * The four subscription plans.
 *
 * Prices are **minor units** (paise). Yearly is priced at ten months, so the discount is
 * visible in the numbers rather than computed at checkout — a discount applied later is a
 * discount that can be forgotten on renewal.
 *
 * Every plan declares **every** limit key explicitly, including the unlimited ones. A
 * missing row is indistinguishable from "not yet configured", and `PlanQuotaService` has
 * to choose between failing open (a paid feature given away) or failing closed (a paying
 * customer blocked). Neither is acceptable, so the seed leaves no gaps.
 */

interface PlanSpec {
  code: string;
  name: string;
  description: string;
  priceMonthlyMinor: string;
  priceYearlyMinor: string;
  trialDays: number;
  sortOrder: number;
  isPublic: boolean;
  features: string[];
  limits: Record<PlanLimitKey, number>;
}

export const PLAN_SPECS: readonly PlanSpec[] = [
  {
    code: 'basic',
    name: 'Basic',
    description: 'For new sellers getting their first store online.',
    priceMonthlyMinor: '99900', // ₹999
    priceYearlyMinor: '999000', // ₹9,990 — ten months
    trialDays: 14,
    sortOrder: 1,
    isPublic: true,
    features: [
      '1 store on a free subdomain',
      'Up to 100 products',
      '2 staff accounts',
      'Standard themes',
      'Email support',
    ],
    limits: {
      max_products: 100,
      max_orders_per_month: 500,
      max_staff_users: 2,
      max_storage_mb: 2_048,
      max_stores: 1,
      max_warehouses: 1,
      // 0, not absent: the feature exists and is explicitly unavailable here, which is
      // what lets the 402 say "upgrade to add channels" instead of "unknown limit".
      max_channels: 0,
      max_custom_domains: 0,
    },
  },
  {
    code: 'standard',
    name: 'Standard',
    description: 'For growing stores that need a custom domain and more room.',
    priceMonthlyMinor: '249900', // ₹2,499
    priceYearlyMinor: '2499000',
    trialDays: 14,
    sortOrder: 2,
    isPublic: true,
    features: [
      'Custom domain with free SSL',
      'Up to 2,000 products',
      '5 staff accounts',
      'Abandoned cart recovery',
      'Priority email support',
    ],
    limits: {
      max_products: 2_000,
      max_orders_per_month: 5_000,
      max_staff_users: 5,
      max_storage_mb: 10_240,
      max_stores: 1,
      max_warehouses: 3,
      max_channels: 2,
      max_custom_domains: 1,
    },
  },
  {
    code: 'premium',
    name: 'Premium',
    description: 'For multi-channel sellers running several stores and warehouses.',
    priceMonthlyMinor: '599900', // ₹5,999
    priceYearlyMinor: '5999000',
    trialDays: 14,
    sortOrder: 3,
    isPublic: true,
    features: [
      'Up to 3 stores',
      'Unlimited products',
      '20 staff accounts',
      'Marketplace channels (Amazon, Flipkart, Meta)',
      'Supplier / reseller marketplace',
      'Phone and email support',
    ],
    limits: {
      max_products: UNLIMITED,
      max_orders_per_month: 50_000,
      max_staff_users: 20,
      max_storage_mb: 51_200,
      max_stores: 3,
      max_warehouses: 10,
      max_channels: 5,
      max_custom_domains: 3,
    },
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Negotiated plan with dedicated infrastructure and support.',
    // Zero because pricing is negotiated per contract. `isPublic: false` keeps it off the
    // pricing page — a ₹0 plan visible to the public would be free unlimited hosting.
    priceMonthlyMinor: '0',
    priceYearlyMinor: '0',
    trialDays: 30,
    sortOrder: 4,
    isPublic: false,
    features: [
      'Unlimited stores, products and staff',
      'Dedicated infrastructure',
      'Custom integrations',
      'Named account manager and SLA',
    ],
    limits: {
      max_products: UNLIMITED,
      max_orders_per_month: UNLIMITED,
      max_staff_users: UNLIMITED,
      max_storage_mb: UNLIMITED,
      max_stores: UNLIMITED,
      max_warehouses: UNLIMITED,
      max_channels: UNLIMITED,
      max_custom_domains: UNLIMITED,
    },
  },
];

/**
 * Idempotent upsert.
 *
 * Plans are matched and updated by `code`, never deleted and recreated: `subscriptions`
 * holds a foreign key to `plans.id`, so a delete-and-reinsert would either fail on the
 * constraint or (worse, if it succeeded) repoint every subscriber at a different plan.
 */
export async function seedPlans(dataSource: DataSource): Promise<{ plans: number; limits: number }> {
  const planRepo = dataSource.getRepository(PlanEntity);
  const limitRepo = dataSource.getRepository(PlanLimitEntity);

  let limitCount = 0;

  for (const spec of PLAN_SPECS) {
    let plan = await planRepo.findOne({ where: { code: spec.code } });

    if (plan) {
      // Prices are updated here, but existing subscriptions are unaffected: they carry a
      // `unit_amount_minor` snapshot taken at signup precisely so a price edit cannot
      // re-price current subscribers.
      plan.name = spec.name;
      plan.description = spec.description;
      plan.priceMonthlyMinor = spec.priceMonthlyMinor;
      plan.priceYearlyMinor = spec.priceYearlyMinor;
      plan.trialDays = spec.trialDays;
      plan.sortOrder = spec.sortOrder;
      plan.isPublic = spec.isPublic;
      plan.features = spec.features;
      plan.status = 'ACTIVE';
    } else {
      plan = planRepo.create({
        code: spec.code,
        name: spec.name,
        description: spec.description,
        priceMonthlyMinor: spec.priceMonthlyMinor,
        priceYearlyMinor: spec.priceYearlyMinor,
        currency: 'INR',
        trialDays: spec.trialDays,
        sortOrder: spec.sortOrder,
        isPublic: spec.isPublic,
        features: spec.features,
        status: 'ACTIVE',
      });
    }

    plan = await planRepo.save(plan);

    for (const [limitKey, limitValue] of Object.entries(spec.limits)) {
      await limitRepo
        .createQueryBuilder()
        .insert()
        .values({
          planId: plan.id,
          limitKey: limitKey as PlanLimitKey,
          limitValue: String(limitValue),
        })
        .orUpdate(['limit_value'], ['plan_id', 'limit_key'])
        // Same reason as the permissions seed: TypeORM would otherwise try to hydrate the
        // inserted row back and fail on the ON DUPLICATE KEY path, which returns no
        // usable insertId.
        .updateEntity(false)
        .execute();

      limitCount += 1;
    }
  }

  return { plans: PLAN_SPECS.length, limits: limitCount };
}
