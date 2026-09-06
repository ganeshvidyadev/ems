import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';

export const PRODUCT_SHARE_STATUSES = ['PENDING', 'ACTIVE', 'PAUSED', 'REJECTED', 'REVOKED'] as const;
export const COMMISSION_TYPES = ['PERCENTAGE', 'FIXED', 'MARGIN'] as const;
export const INVENTORY_MODES = ['SHARED', 'ALLOCATED'] as const;

export const requestProductShareSchema = z.object({
  productPublicId: publicIdSchema,
  resellerTenantPublicId: publicIdSchema,
  commissionType: z.enum(COMMISSION_TYPES),
  /** Percent (PERCENTAGE) or minor-currency flat amount per unit (FIXED); ignored for MARGIN. */
  commissionValue: z.string().regex(/^\d+(\.\d+)?$/),
  platformFeeRate: z.string().regex(/^\d+(\.\d+)?$/).default('0'),
  resellerPriceMinor: z.string().regex(/^\d+$/).optional(),
  minPriceMinor: z.string().regex(/^\d+$/).optional(),
  allowPriceOverride: z.boolean().default(false),
  inventoryMode: z.enum(INVENTORY_MODES).default('SHARED'),
  allocatedQuantity: z.number().int().positive().optional(),
});
export type RequestProductShareRequest = z.infer<typeof requestProductShareSchema>;

export const productShareResponseSchema = z.object({
  id: publicIdSchema,
  productId: publicIdSchema,
  productName: z.string(),
  supplierTenantId: publicIdSchema,
  supplierBusinessName: z.string(),
  resellerTenantId: publicIdSchema,
  resellerBusinessName: z.string(),
  status: z.enum(PRODUCT_SHARE_STATUSES),
  commissionType: z.enum(COMMISSION_TYPES),
  commissionValue: z.string(),
  platformFeeRate: z.string(),
  resellerPriceMinor: z.string().nullable(),
  minPriceMinor: z.string().nullable(),
  allowPriceOverride: z.boolean(),
  inventoryMode: z.enum(INVENTORY_MODES),
  allocatedQuantity: z.number().nullable(),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ProductShareResponse = z.infer<typeof productShareResponseSchema>;

export const resellerDirectoryEntrySchema = z.object({
  tenantId: publicIdSchema,
  businessName: z.string(),
  slug: z.string(),
});
export type ResellerDirectoryEntryResponse = z.infer<typeof resellerDirectoryEntrySchema>;

export const commissionLedgerEntryResponseSchema = z.object({
  id: publicIdSchema,
  orderId: z.string(),
  entryType: z.enum(['SALE', 'COMMISSION', 'PLATFORM_FEE', 'REFUND_REVERSAL', 'ADJUSTMENT']),
  direction: z.enum(['DEBIT', 'CREDIT']),
  beneficiaryType: z.enum(['SUPPLIER', 'RESELLER', 'PLATFORM']),
  grossMinor: z.string(),
  commissionMinor: z.string(),
  platformFeeMinor: z.string(),
  taxMinor: z.string(),
  netMinor: z.string(),
  currency: z.string(),
  settled: z.boolean(),
  description: z.string().nullable(),
  createdAt: z.string(),
});
export type CommissionLedgerEntryResponse = z.infer<typeof commissionLedgerEntryResponseSchema>;

export const SETTLEMENT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'PROCESSING',
  'PAID',
  'FAILED',
  'ON_HOLD',
] as const;

export const runSettlementBatchRequestSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type RunSettlementBatchRequest = z.infer<typeof runSettlementBatchRequestSchema>;

export const markSettlementPaidRequestSchema = z.object({
  payoutMethod: z.enum(['BANK_TRANSFER', 'GATEWAY_PAYOUT']),
  payoutReference: z.string().trim().min(1).max(191),
});
export type MarkSettlementPaidRequest = z.infer<typeof markSettlementPaidRequestSchema>;

export const settlementResponseSchema = z.object({
  id: publicIdSchema,
  beneficiaryTenantId: publicIdSchema,
  beneficiaryBusinessName: z.string(),
  settlementNumber: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.enum(SETTLEMENT_STATUSES),
  grossMinor: z.string(),
  commissionMinor: z.string(),
  platformFeeMinor: z.string(),
  taxMinor: z.string(),
  adjustmentMinor: z.string(),
  netPayableMinor: z.string(),
  currency: z.string(),
  entryCount: z.number(),
  payoutMethod: z.enum(['BANK_TRANSFER', 'GATEWAY_PAYOUT']).nullable(),
  payoutReference: z.string().nullable(),
  paidAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  createdAt: z.string(),
});
export type SettlementResponse = z.infer<typeof settlementResponseSchema>;
