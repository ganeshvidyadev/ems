import { z } from 'zod';
import { moneySchema, phoneSchema, publicIdSchema } from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';
import { addressRequestSchema } from '../customer/customer.contracts.js';

export const ORDER_STATUSES = [
  'DRAFT',
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'RETURNED',
  'FAILED',
  'ON_HOLD',
] as const;

export const ORDER_PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'PARTIALLY_PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
  'VOIDED',
] as const;

export const ORDER_FULFILMENT_STATUSES = [
  'UNFULFILLED',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'RETURNED',
  'PARTIALLY_RETURNED',
] as const;

export const orderAddressSchema = addressRequestSchema
  .pick({
    recipientName: true,
    phone: true,
    addressLine1: true,
    addressLine2: true,
    landmark: true,
    city: true,
    stateCode: true,
    stateName: true,
    postalCode: true,
    countryCode: true,
  })
  .extend({ phone: phoneSchema.nullable().optional() });
export type OrderAddress = z.infer<typeof orderAddressSchema>;

export const orderItemResponseSchema = z.object({
  id: z.string(),
  productId: publicIdSchema.nullable(),
  variantId: publicIdSchema.nullable(),
  sku: z.string(),
  name: z.string(),
  variantTitle: z.string().nullable(),
  imageUrl: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: moneySchema,
  lineSubtotal: moneySchema,
  lineDiscount: moneySchema,
  lineTax: moneySchema,
  lineTotal: moneySchema,
  quantityFulfilled: z.number().int(),
  quantityReturned: z.number().int(),
  quantityCancelled: z.number().int(),
});
export type OrderItemResponse = z.infer<typeof orderItemResponseSchema>;

export const orderStatusHistoryResponseSchema = z.object({
  statusType: z.enum(['ORDER', 'PAYMENT', 'FULFILMENT']),
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  reason: z.string().nullable(),
  actorType: z.enum(['USER', 'CUSTOMER', 'SYSTEM', 'WEBHOOK']),
  createdAt: z.string(),
});
export type OrderStatusHistoryResponse = z.infer<typeof orderStatusHistoryResponseSchema>;

export const orderResponseSchema = z.object({
  id: publicIdSchema,
  orderNumber: z.string(),
  storeId: publicIdSchema,
  customerId: publicIdSchema.nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.enum(ORDER_STATUSES),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES),
  fulfilmentStatus: z.enum(ORDER_FULFILMENT_STATUSES),
  currency: z.string().length(3),
  subtotal: moneySchema,
  discount: moneySchema,
  shipping: moneySchema,
  tax: moneySchema,
  codFee: moneySchema,
  total: moneySchema,
  amountPaid: moneySchema,
  amountRefunded: moneySchema,
  shippingAddress: orderAddressSchema.nullable(),
  billingAddress: orderAddressSchema.nullable(),
  channel: z.string(),
  couponCode: z.string().nullable(),
  customerNote: z.string().nullable(),
  cancelReason: z.string().nullable(),
  items: z.array(orderItemResponseSchema),
  timeline: z.array(orderStatusHistoryResponseSchema).optional(),
  placedAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const orderListQuerySchema = listQuerySchema.extend({
  storeId: publicIdSchema.optional(),
  customerId: publicIdSchema.optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
  fulfilmentStatus: z.enum(ORDER_FULFILMENT_STATUSES).optional(),
  sort: sortQuerySchema(['createdAt', 'totalMinor', 'orderNumber'] as const, [
    { field: 'createdAt', direction: 'DESC' },
  ]),
});

export const cancelOrderRequestSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;

export const holdOrderRequestSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});
export type HoldOrderRequest = z.infer<typeof holdOrderRequestSchema>;

export const fulfilOrderItemSchema = z.object({
  orderItemId: z.string(),
  quantity: z.number().int().positive(),
});

export const fulfilOrderRequestSchema = z.object({
  warehouseId: publicIdSchema.optional(),
  items: z.array(fulfilOrderItemSchema).min(1),
  /** Omit to have the configured carrier create a real shipment (AWB, label, tracking URL). */
  carrier: z.string().max(32).optional(),
  /** Supplying an AWB directly records a manual/offline shipment instead of calling a carrier. */
  awbNumber: z.string().max(100).optional(),
  weightGrams: z.number().int().positive().optional(),
  dimensions: z
    .object({
      lengthMm: z.number().int().positive(),
      widthMm: z.number().int().positive(),
      heightMm: z.number().int().positive(),
    })
    .optional(),
  notifyCustomer: z.boolean().default(true),
});
export type FulfilOrderRequest = z.infer<typeof fulfilOrderRequestSchema>;
