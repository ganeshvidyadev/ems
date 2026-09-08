import { z } from 'zod';
import { emailSchema, moneySchema, phoneSchema, publicIdSchema } from '../common/primitives.js';
import { orderAddressSchema } from '../order/order.contracts.js';

export const checkoutPricingRequestSchema = z.object({
  cartId: z.string().min(1),
  shippingAddress: orderAddressSchema.optional(),
  shippingMethod: z.string().max(64).optional(),
  // Lets the pricing preview quote the same COD handling fee `placeOrder()`
  // actually charges — without it the preview total and the placed-order
  // total silently diverged by the fee amount (BUG-FE-011).
  paymentGateway: z.enum(['razorpay', 'stripe', 'paypal', 'cashfree', 'phonepe', 'cod', 'stub']).optional(),
});
export type CheckoutPricingRequest = z.infer<typeof checkoutPricingRequestSchema>;

export const checkoutPricingResponseSchema = z.object({
  subtotal: moneySchema,
  discount: moneySchema,
  shipping: moneySchema,
  tax: moneySchema,
  /** Present (and non-zero) only when `paymentGateway: 'cod'` was quoted. */
  codFee: moneySchema.optional(),
  total: moneySchema,
});
export type CheckoutPricingResponse = z.infer<typeof checkoutPricingResponseSchema>;

/**
 * Places an order from the current cart: address → shipping method → payment.
 * The `Idempotency-Key` header (not a body field) is what makes a retried
 * submit safe — see docs/04 §7.
 */
export const placeOrderRequestSchema = z.object({
  cartId: z.string().min(1),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  shippingAddress: orderAddressSchema,
  billingAddress: orderAddressSchema.optional(),
  shippingMethod: z.string().max(64).default('STANDARD'),
  paymentGateway: z.enum(['razorpay', 'stripe', 'paypal', 'cashfree', 'phonepe', 'cod', 'stub']),
  giftCardCode: z.string().trim().max(64).optional(),
  customerNote: z.string().trim().max(2000).optional(),
});
export type PlaceOrderRequest = z.infer<typeof placeOrderRequestSchema>;

export const placeOrderResponseSchema = z.object({
  orderId: publicIdSchema,
  orderNumber: z.string(),
  total: moneySchema,
  paymentStatus: z.string(),
  /** Present when the gateway needs a client-side step (redirect/modal); absent for COD. */
  payment: z
    .object({
      paymentId: publicIdSchema,
      gateway: z.string(),
      clientPayload: z.record(z.unknown()),
    })
    .nullable(),
});
export type PlaceOrderResponse = z.infer<typeof placeOrderResponseSchema>;

export const confirmOrderPaymentRequestSchema = z.object({
  gateway: z.enum(['razorpay', 'stripe', 'paypal', 'cashfree', 'phonepe', 'stub']),
  gatewayOrderId: z.string().min(1),
  gatewayPaymentId: z.string().min(1),
  signature: z.string().min(1),
});
export type ConfirmOrderPaymentRequest = z.infer<typeof confirmOrderPaymentRequestSchema>;

export const confirmOrderPaymentResponseSchema = z.object({
  status: z.string(),
  orderId: publicIdSchema.nullable(),
  orderNumber: z.string().nullable(),
});
export type ConfirmOrderPaymentResponse = z.infer<typeof confirmOrderPaymentResponseSchema>;

export const createRefundRequestSchema = z.object({
  amountMinor: z.string().regex(/^\d+$/).optional(),
  reason: z.string().trim().max(255).optional(),
  returnId: publicIdSchema.optional(),
});
export type CreateRefundRequest = z.infer<typeof createRefundRequestSchema>;

export const refundResponseSchema = z.object({
  id: publicIdSchema,
  paymentId: publicIdSchema,
  amount: moneySchema,
  status: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type RefundResponse = z.infer<typeof refundResponseSchema>;
