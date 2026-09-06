import { z } from 'zod';
import { moneySchema, publicIdSchema } from '../common/primitives.js';

/**
 * Carts live in Redis, not MySQL (docs/02 §10) — these schemas describe the
 * shape stored under `cart:{tenantId}:{cartId}` and returned to the client,
 * not a table.
 */

export const cartLineItemSchema = z.object({
  productId: publicIdSchema,
  variantId: publicIdSchema.nullable(),
  sku: z.string(),
  name: z.string(),
  variantTitle: z.string().nullable(),
  imageUrl: z.string().nullable(),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.string(),
  lineSubtotalMinor: z.string(),
  addedAt: z.string(),
});
export type CartLineItem = z.infer<typeof cartLineItemSchema>;

export const cartResponseSchema = z.object({
  id: z.string(),
  storeId: publicIdSchema,
  currency: z.string().length(3),
  items: z.array(cartLineItemSchema),
  itemCount: z.number().int(),
  couponCode: z.string().nullable(),
  subtotal: moneySchema,
  discount: moneySchema,
  shippingEstimate: moneySchema,
  taxEstimate: moneySchema,
  total: moneySchema,
  expiresAt: z.string(),
});
export type CartResponse = z.infer<typeof cartResponseSchema>;

export const addCartItemRequestSchema = z.object({
  productId: publicIdSchema,
  variantId: publicIdSchema.optional(),
  quantity: z.number().int().positive().max(999).default(1),
});
export type AddCartItemRequest = z.infer<typeof addCartItemRequestSchema>;

export const updateCartItemRequestSchema = z.object({
  quantity: z.number().int().min(0).max(999),
});
export type UpdateCartItemRequest = z.infer<typeof updateCartItemRequestSchema>;

export const applyCartCouponRequestSchema = z.object({
  code: z.string().trim().min(1).max(64),
});
export type ApplyCartCouponRequest = z.infer<typeof applyCartCouponRequestSchema>;

export const applyCartGiftCardRequestSchema = z.object({
  code: z.string().trim().min(1).max(64),
});
export type ApplyCartGiftCardRequest = z.infer<typeof applyCartGiftCardRequestSchema>;
