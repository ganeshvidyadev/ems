import { z } from 'zod';
import { moneySchema, publicIdSchema } from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const RETURN_TYPES = ['RETURN', 'EXCHANGE', 'REPLACEMENT'] as const;
export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'IN_TRANSIT',
  'RECEIVED',
  'INSPECTED',
  'COMPLETED',
  'CANCELLED',
] as const;
export const RETURN_REASONS = [
  'DAMAGED',
  'WRONG_ITEM',
  'SIZE_ISSUE',
  'NOT_AS_DESCRIBED',
  'CHANGED_MIND',
  'DEFECTIVE',
] as const;
export const RETURN_INSPECTION_RESULTS = ['RESELLABLE', 'DAMAGED', 'SCRAP'] as const;

export const requestReturnItemSchema = z.object({
  orderItemId: z.string().min(1),
  quantity: z.number().int().positive(),
  restock: z.boolean().default(true),
});

export const requestReturnRequestSchema = z.object({
  type: z.enum(RETURN_TYPES).default('RETURN'),
  reason: z.enum(RETURN_REASONS),
  reasonDetail: z.string().trim().max(2000).optional(),
  customerImages: z.array(z.string().url()).max(10).optional(),
  items: z.array(requestReturnItemSchema).min(1),
});
export type RequestReturnRequest = z.infer<typeof requestReturnRequestSchema>;

export const rejectReturnRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type RejectReturnRequest = z.infer<typeof rejectReturnRequestSchema>;

export const inspectReturnRequestSchema = z.object({
  result: z.enum(RETURN_INSPECTION_RESULTS),
  refundAmountMinor: z.string().regex(/^\d+$/).optional(),
  restockingFeeMinor: z.string().regex(/^\d+$/).optional(),
});
export type InspectReturnRequest = z.infer<typeof inspectReturnRequestSchema>;

export const returnItemResponseSchema = z.object({
  orderItemId: z.string(),
  quantity: z.number().int(),
  conditionNote: z.string().nullable(),
  restock: z.boolean(),
  refund: moneySchema.nullable(),
});
export type ReturnItemResponse = z.infer<typeof returnItemResponseSchema>;

export const returnResponseSchema = z.object({
  id: publicIdSchema,
  orderId: publicIdSchema,
  rmaNumber: z.string(),
  type: z.enum(RETURN_TYPES),
  status: z.enum(RETURN_STATUSES),
  reason: z.enum(RETURN_REASONS),
  reasonDetail: z.string().nullable(),
  refundAmount: moneySchema.nullable(),
  restockingFee: moneySchema,
  inspectionResult: z.enum(RETURN_INSPECTION_RESULTS).nullable(),
  items: z.array(returnItemResponseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReturnResponse = z.infer<typeof returnResponseSchema>;

export const returnListQuerySchema = listQuerySchema.extend({
  orderId: publicIdSchema.optional(),
  status: z.enum(RETURN_STATUSES).optional(),
  sort: sortQuerySchema(['createdAt'] as const, [{ field: 'createdAt', direction: 'DESC' }]),
});
