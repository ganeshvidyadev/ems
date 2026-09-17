import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';
import { listQuerySchema } from '../common/pagination.js';

export const INVOICE_STATUSES = [
  'DRAFT',
  'OPEN',
  'PAID',
  'PARTIALLY_PAID',
  'UNCOLLECTIBLE',
  'VOID',
  'REFUNDED',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type SubscriptionPaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const invoiceLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitAmountMinor: z.string(),
  amountMinor: z.string(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  proration: z.boolean().optional(),
});
export type PlatformInvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;

export const platformInvoiceListQuerySchema = listQuerySchema.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  tenantId: publicIdSchema.optional(),
});
export type PlatformInvoiceListQuery = z.infer<typeof platformInvoiceListQuerySchema>;

export const platformSubscriptionPaymentResponseSchema = z.object({
  id: publicIdSchema,
  gateway: z.string(),
  status: z.enum(PAYMENT_STATUSES),
  amountMinor: z.string(),
  currency: z.string(),
  method: z.string().nullable(),
  capturedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
});
export type PlatformSubscriptionPaymentResponse = z.infer<typeof platformSubscriptionPaymentResponseSchema>;

export const platformInvoiceResponseSchema = z.object({
  id: publicIdSchema,
  tenantId: publicIdSchema,
  tenantName: z.string(),
  invoiceNumber: z.string(),
  status: z.enum(INVOICE_STATUSES),
  subtotalMinor: z.string(),
  discountMinor: z.string(),
  taxMinor: z.string(),
  totalMinor: z.string(),
  amountPaidMinor: z.string(),
  amountDueMinor: z.string(),
  currency: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  dueAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  voidedAt: z.string().nullable(),
  lineItems: z.array(invoiceLineItemSchema),
  payments: z.array(platformSubscriptionPaymentResponseSchema),
  createdAt: z.string(),
});
export type PlatformInvoiceResponse = z.infer<typeof platformInvoiceResponseSchema>;

export const adjustInvoiceRequestSchema = z.object({
  description: z.string().trim().min(3).max(255),
  /** Minor units; negative issues a credit line, positive an additional charge. */
  amountMinor: z.string().regex(/^-?\d+$/, 'Minor units — a whole integer'),
});
export type AdjustInvoiceRequest = z.infer<typeof adjustInvoiceRequestSchema>;

export const refundPaymentRequestSchema = z.object({
  reason: z.string().trim().min(5).max(255),
});
export type RefundPaymentRequest = z.infer<typeof refundPaymentRequestSchema>;
