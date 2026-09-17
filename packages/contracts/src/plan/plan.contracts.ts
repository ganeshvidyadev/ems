import { z } from 'zod';

/** Mirrors `PLAN_LIMIT_KEYS` in `apps/api/src/database/entities/plan.entity.ts` — kept as
 * a second, wire-facing copy rather than a cross-package import, same as `TenantStatus`. */
export const PLAN_LIMIT_KEYS = [
  'max_products',
  'max_orders_per_month',
  'max_staff_users',
  'max_storage_mb',
  'max_stores',
  'max_warehouses',
  'max_channels',
  'max_custom_domains',
] as const;
export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];

/** -1 means unlimited; 0 means the feature is unavailable on this plan. */
export const planLimitsSchema = z.record(z.enum(PLAN_LIMIT_KEYS), z.number().int().min(-1));
export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const PLAN_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const createPlanRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and hyphens only'),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).optional(),
  priceMonthlyMinor: z.string().regex(/^\d+$/, 'Minor units — a whole non-negative integer'),
  priceYearlyMinor: z.string().regex(/^\d+$/, 'Minor units — a whole non-negative integer'),
  currency: z.string().length(3).default('INR'),
  trialDays: z.number().int().min(0).max(365).default(14),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  features: z.array(z.string().trim().min(1)).default([]),
  limits: planLimitsSchema.default({}),
});
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

export const updatePlanRequestSchema = createPlanRequestSchema.omit({ code: true }).partial();
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>;

export const planResponseSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceMonthlyMinor: z.string(),
  priceYearlyMinor: z.string(),
  currency: z.string(),
  trialDays: z.number(),
  isPublic: z.boolean(),
  sortOrder: z.number(),
  features: z.array(z.string()),
  status: z.enum(PLAN_STATUSES),
  limits: planLimitsSchema,
  /** Active subscriptions on this plan right now — context before archiving/deleting it. */
  subscriberCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;
