import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';
import { listQuerySchema } from '../common/pagination.js';

export const LOYALTY_TRANSACTION_TYPES = ['EARN', 'REDEEM', 'EXPIRE', 'ADJUST', 'REVERSAL'] as const;

export const loyaltyTransactionResponseSchema = z.object({
  id: z.string(),
  type: z.enum(LOYALTY_TRANSACTION_TYPES),
  pointsDelta: z.number().int(),
  pointsAfter: z.number().int(),
  orderId: publicIdSchema.nullable(),
  description: z.string().nullable(),
  createdAt: z.string(),
});
export type LoyaltyTransactionResponse = z.infer<typeof loyaltyTransactionResponseSchema>;

export const loyaltyTransactionListQuerySchema = listQuerySchema;

export const adjustLoyaltyPointsRequestSchema = z.object({
  pointsDelta: z.number().int().refine((v) => v !== 0, 'pointsDelta must not be zero'),
  description: z.string().trim().max(255).optional(),
});
export type AdjustLoyaltyPointsRequest = z.infer<typeof adjustLoyaltyPointsRequestSchema>;

export const redeemLoyaltyPointsRequestSchema = z.object({
  points: z.number().int().positive(),
});
export type RedeemLoyaltyPointsRequest = z.infer<typeof redeemLoyaltyPointsRequestSchema>;

export const loyaltyBalanceResponseSchema = z.object({
  customerId: publicIdSchema,
  balance: z.number().int(),
});
export type LoyaltyBalanceResponse = z.infer<typeof loyaltyBalanceResponseSchema>;
