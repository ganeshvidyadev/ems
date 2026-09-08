import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const COUPON_DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'BUY_X_GET_Y'] as const;
export const COUPON_APPLIES_TO = ['ORDER', 'PRODUCTS', 'CATEGORIES', 'SHIPPING'] as const;
export const COUPON_ELIGIBILITIES = ['ALL', 'NEW', 'RETURNING', 'GROUP', 'SPECIFIC'] as const;
export const COUPON_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;

export const createCouponRequestSchema = z
  .object({
    storeId: publicIdSchema.optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3, 'Must be at least 3 characters')
      .max(64, 'Must be at most 64 characters')
      .regex(/^[A-Z0-9_-]+$/, 'Letters, digits, hyphens and underscores only'),
    name: z.string().trim().max(255).optional(),
    description: z.string().trim().max(500).optional(),
    discountType: z.enum(COUPON_DISCOUNT_TYPES),
    discountValue: z.string().regex(/^\d+(\.\d+)?$/),
    maxDiscountMinor: z.string().regex(/^\d+$/).optional(),
    minOrderMinor: z.string().regex(/^\d+$/).optional(),
    appliesTo: z.enum(COUPON_APPLIES_TO).default('ORDER'),
    targetIds: z.array(publicIdSchema).max(500).optional(),
    excludedIds: z.array(publicIdSchema).max(500).optional(),
    buyQuantity: z.number().int().positive().optional(),
    getQuantity: z.number().int().positive().optional(),
    usageLimitTotal: z.number().int().positive().optional(),
    usageLimitPerCustomer: z.number().int().positive().optional(),
    customerEligibility: z.enum(COUPON_ELIGIBILITIES).default('ALL'),
    eligibleCustomerIds: z.array(publicIdSchema).max(1000).optional(),
    eligibleGroup: z.string().max(64).optional(),
    combinable: z.boolean().default(false),
    autoApply: z.boolean().default(false),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
  })
  // A single `superRefine` (rather than several chained `.refine()` calls) so this
  // stays exactly one `ZodEffects` layer — `updateCouponRequestSchema` and the
  // console form both peel it off with a single `.innerType()`, which a second
  // chained refine would break.
  .superRefine((v, ctx) => {
    if (v.discountType === 'BUY_X_GET_Y' && !(v.buyQuantity && v.getQuantity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'buyQuantity and getQuantity are required for BUY_X_GET_Y coupons',
        path: ['buyQuantity'],
      });
    }
    // `discountValue` carries two different meanings depending on `discountType`
    // — percentage points for PERCENTAGE, minor-unit currency for FIXED_AMOUNT —
    // so neither could carry a numeric bound on its own. Server-side enforcement
    // matters more than the console form's mirror of this, since coupons can
    // also be created directly through the API (BUG-FE-010).
    if (v.discountType === 'PERCENTAGE') {
      const n = Number(v.discountValue);
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Percentage must be between 0 and 100',
          path: ['discountValue'],
        });
      }
    }
    if (v.discountType === 'FIXED_AMOUNT' && !/^\d+$/.test(v.discountValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must be a non-negative integer amount in minor units',
        path: ['discountValue'],
      });
    }
  });
export type CreateCouponRequest = z.infer<typeof createCouponRequestSchema>;

export const updateCouponRequestSchema = createCouponRequestSchema.innerType().partial().extend({
  status: z.enum(COUPON_STATUSES).optional(),
});
export type UpdateCouponRequest = z.infer<typeof updateCouponRequestSchema>;

export const couponResponseSchema = z.object({
  id: publicIdSchema,
  storeId: publicIdSchema.nullable(),
  code: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  discountType: z.enum(COUPON_DISCOUNT_TYPES),
  discountValue: z.string(),
  maxDiscountMinor: z.string().nullable(),
  minOrderMinor: z.string().nullable(),
  appliesTo: z.enum(COUPON_APPLIES_TO),
  usageLimitTotal: z.number().int().nullable(),
  usageLimitPerCustomer: z.number().int().nullable(),
  usageCount: z.number().int(),
  customerEligibility: z.enum(COUPON_ELIGIBILITIES),
  combinable: z.boolean(),
  autoApply: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  status: z.enum(COUPON_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CouponResponse = z.infer<typeof couponResponseSchema>;

export const couponListQuerySchema = listQuerySchema.extend({
  status: z.enum(COUPON_STATUSES).optional(),
  sort: sortQuerySchema(['code', 'createdAt', 'usageCount'] as const),
});
export type CouponListQuery = z.infer<typeof couponListQuerySchema>;

export const validateCouponRequestSchema = z.object({
  code: z.string().trim().min(1).max(64),
  subtotalMinor: z.string().regex(/^\d+$/),
  customerId: publicIdSchema.optional(),
});
export type ValidateCouponRequest = z.infer<typeof validateCouponRequestSchema>;

export const validateCouponResponseSchema = z.object({
  valid: z.boolean(),
  discountMinor: z.string(),
  reason: z.string().optional(),
});
export type ValidateCouponResponse = z.infer<typeof validateCouponResponseSchema>;
