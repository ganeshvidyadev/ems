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

/**
 * The public, shopper-facing view of a store — deliberately narrower than
 * `storeResponseSchema`.
 *
 * `status` is omitted: whether a store is DRAFT or MAINTENANCE is operational
 * detail a shopper has no use for, and a storefront that is reachable at all is
 * one the tenant chose to publish. `id` stays because the cart and checkout
 * endpoints require a store's public id and the storefront has nowhere else to
 * learn it — a shopper can only ever obtain their own store's, which is the same
 * id every product on the page already carries.
 */
export const storefrontStoreResponseSchema = z.object({
  id: publicIdSchema,
  name: z.string(),
  slug: z.string(),
  currency: z.string(),
});
export type StorefrontStoreResponse = z.infer<typeof storefrontStoreResponseSchema>;
