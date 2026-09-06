import { z } from 'zod';
import { moneySchema, publicIdSchema } from '../common/primitives.js';
import { listQuerySchema } from '../common/pagination.js';

export const GIFT_CARD_STATUSES = ['ACTIVE', 'DEPLETED', 'EXPIRED', 'DISABLED'] as const;

export const issueGiftCardRequestSchema = z.object({
  amountMinor: z.string().regex(/^\d+$/),
  currency: z.string().length(3).toUpperCase(),
  issuedToEmail: z.string().email().optional(),
  issuedToCustomerId: publicIdSchema.optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});
export type IssueGiftCardRequest = z.infer<typeof issueGiftCardRequestSchema>;

/** Returned once, at issuance, alongside the persisted `codeLast4`. Never retrievable again. */
export const issueGiftCardResponseSchema = z.object({
  id: publicIdSchema,
  code: z.string(),
  balance: moneySchema,
  status: z.enum(GIFT_CARD_STATUSES),
  expiresAt: z.string().nullable(),
});
export type IssueGiftCardResponse = z.infer<typeof issueGiftCardResponseSchema>;

export const giftCardResponseSchema = z.object({
  id: publicIdSchema,
  codeLast4: z.string(),
  initialValue: moneySchema,
  balance: moneySchema,
  status: z.enum(GIFT_CARD_STATUSES),
  issuedToEmail: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type GiftCardResponse = z.infer<typeof giftCardResponseSchema>;

export const giftCardListQuerySchema = listQuerySchema;

export const checkGiftCardBalanceRequestSchema = z.object({
  code: z.string().trim().min(1).max(64),
});
export type CheckGiftCardBalanceRequest = z.infer<typeof checkGiftCardBalanceRequestSchema>;

export const checkGiftCardBalanceResponseSchema = z.object({
  valid: z.boolean(),
  balance: moneySchema.optional(),
});
export type CheckGiftCardBalanceResponse = z.infer<typeof checkGiftCardBalanceResponseSchema>;
