import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';

export const WAREHOUSE_TYPES = ['WAREHOUSE', 'STORE', 'DROPSHIP', 'VIRTUAL'] as const;
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number];

/**
 * Read-only — enough to populate a warehouse picker for stock adjust/transfer
 * forms. Warehouse settings (address, priority, activation) are a separate,
 * later feature.
 */
export const warehouseResponseSchema = z.object({
  id: publicIdSchema,
  code: z.string(),
  name: z.string(),
  type: z.enum(WAREHOUSE_TYPES),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});
export type WarehouseResponse = z.infer<typeof warehouseResponseSchema>;
