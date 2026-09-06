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
      .min(3)
      .max(64)
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
  .refine((v) => v.discountType !== 'BUY_X_GET_Y' || (v.buyQuantity && v.getQuantity), {
    message: 'buyQuantity and getQuantity are required for BUY_X_GET_Y coupons',
    path: ['buyQuantity'],
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
