import { z } from 'zod';
import { booleanQuerySchema, publicIdSchema } from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const INVENTORY_MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'ADJUSTMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'DAMAGE',
  'THEFT',
  'EXPIRY',
  'RESERVATION',
  'RELEASE',
  'COUNT_CORRECTION',
] as const;

export const inventoryLevelResponseSchema = z.object({
  warehouseId: publicIdSchema,
  warehouseName: z.string(),
  productId: publicIdSchema,
  variantId: publicIdSchema.nullable(),
  quantityOnHand: z.number().int(),
  quantityReserved: z.number().int(),
  quantityIncoming: z.number().int(),
  quantityAvailable: z.number().int(),
  reorderPoint: z.number().int().nullable(),
  reorderQuantity: z.number().int().nullable(),
  binLocation: z.string().nullable(),
  lastCountedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type InventoryLevelResponse = z.infer<typeof inventoryLevelResponseSchema>;

export const inventoryLevelListQuerySchema = listQuerySchema.extend({
  productId: publicIdSchema.optional(),
  warehouseId: publicIdSchema.optional(),
  lowStockOnly: booleanQuerySchema.optional(),
  sort: sortQuerySchema(['quantityAvailable', 'updatedAt'] as const, [
    { field: 'updatedAt', direction: 'DESC' },
  ]),
});

/** Sets `reorderPoint`/`reorderQuantity`/`binLocation`, creating the slot row if absent. */
export const upsertInventorySettingsRequestSchema = z.object({
  warehouseId: publicIdSchema,
  productId: publicIdSchema,
  variantId: publicIdSchema.nullable().optional(),
  reorderPoint: z.number().int().nonnegative().nullable().optional(),
  reorderQuantity: z.number().int().nonnegative().nullable().optional(),
  binLocation: z.string().trim().max(64).nullable().optional(),
});
export type UpsertInventorySettingsRequest = z.infer<typeof upsertInventorySettingsRequestSchema>;

/** Manual stock adjustment — recount, damage, theft, expiry. */
export const adjustInventoryRequestSchema = z.object({
  warehouseId: publicIdSchema,
  productId: publicIdSchema,
  variantId: publicIdSchema.nullable().optional(),
  quantityDelta: z.number().int().refine((v) => v !== 0, 'quantityDelta must not be zero'),
  type: z.enum(['ADJUSTMENT', 'DAMAGE', 'THEFT', 'EXPIRY', 'COUNT_CORRECTION']),
  reason: z.string().trim().max(255).optional(),
  unitCostMinor: z.string().regex(/^\d+$/).optional(),
});
export type AdjustInventoryRequest = z.infer<typeof adjustInventoryRequestSchema>;

/** Moves stock between two warehouses as one atomic pair of movements. */
export const transferInventoryRequestSchema = z.object({
  fromWarehouseId: publicIdSchema,
  toWarehouseId: publicIdSchema,
  productId: publicIdSchema,
  variantId: publicIdSchema.nullable().optional(),
  quantity: z.number().int().positive(),
  reason: z.string().trim().max(255).optional(),
});
export type TransferInventoryRequest = z.infer<typeof transferInventoryRequestSchema>;

export const inventoryMovementResponseSchema = z.object({
  id: z.string(),
  warehouseId: publicIdSchema,
  productId: publicIdSchema,
  variantId: publicIdSchema.nullable(),
  type: z.enum(INVENTORY_MOVEMENT_TYPES),
  quantityDelta: z.number().int(),
  quantityAfter: z.number().int(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type InventoryMovementResponse = z.infer<typeof inventoryMovementResponseSchema>;

export const inventoryMovementListQuerySchema = listQuerySchema.extend({
  productId: publicIdSchema.optional(),
  warehouseId: publicIdSchema.optional(),
});
