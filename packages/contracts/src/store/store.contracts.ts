import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';

export const STORE_STATUSES = ['DRAFT', 'ACTIVE', 'MAINTENANCE', 'CLOSED'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

/**
 * A read-only summary — enough for a store picker or a "which store am I
 * managing" header, not the full settings surface (logo/address/timezone
 * editing is a separate, later feature).
 */
export const storeResponseSchema = z.object({
  id: publicIdSchema,
  name: z.string(),
  slug: z.string(),
  status: z.enum(STORE_STATUSES),
  currency: z.string(),
});
export type StoreResponse = z.infer<typeof storeResponseSchema>;
