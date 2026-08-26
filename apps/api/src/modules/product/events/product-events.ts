/**
 * Product domain event types, written to the outbox in the same transaction as the write
 * that caused them (docs/01 — transactional outbox). Consumers arrive in later phases:
 * `product.created`/`updated` route to `channel-sync` today (see `EVENT_ROUTING` in
 * `queue-names.enum.ts`); inventory and marketplace will add their own subscribers without
 * this module changing.
 */
export const ProductEvent = {
  CREATED: 'product.created',
  UPDATED: 'product.updated',
  PUBLISHED: 'product.published',
  DELETED: 'product.deleted',
} as const;

export type ProductEventType = (typeof ProductEvent)[keyof typeof ProductEvent];
