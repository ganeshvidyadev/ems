/**
 * Queue registry (docs/01 §6.1).
 *
 * Separate queues rather than one queue with a job-type field, because
 * concurrency, retry policy and failure impact differ per workload. A 50k-row
 * product import must not be able to starve checkout notifications, and a
 * marketplace API that rate-limits us must not slow down inventory sync.
 */
export const QueueName = {
  ORDER_LIFECYCLE: 'order-lifecycle',
  PAYMENT_RECONCILE: 'payment-reconcile',
  INVENTORY_SYNC: 'inventory-sync',
  NOTIFICATION: 'notification',
  CHANNEL_SYNC: 'channel-sync',
  IMPORT_EXPORT: 'import-export',
  MEDIA_PROCESS: 'media-process',
  REPORT_GENERATION: 'report-generation',
  PROVISIONING: 'provisioning',
  SUBSCRIPTION_BILLING: 'subscription-billing',
  ANALYTICS_ROLLUP: 'analytics-rollup',
  COMMISSION: 'commission',
  DOMAIN_VERIFICATION: 'domain-verification',
  DEAD_LETTER: 'dead-letter',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export const ALL_QUEUES: readonly QueueName[] = Object.values(QueueName);

export interface QueueSettings {
  concurrency: number;
  attempts: number;
  backoffMs: number;
}

/**
 * Per-queue tuning.
 *
 * `attempts` is highest where the failure is most likely to be transient and most
 * expensive to lose: `payment-reconcile` retries eight times because a gateway
 * blip must not leave a customer charged with no order, while `import-export`
 * retries once because re-running a partially applied 50k-row import would create
 * duplicates.
 */
export const QUEUE_SETTINGS: Record<QueueName, QueueSettings> = {
  [QueueName.ORDER_LIFECYCLE]: { concurrency: 10, attempts: 5, backoffMs: 2_000 },
  [QueueName.PAYMENT_RECONCILE]: { concurrency: 5, attempts: 8, backoffMs: 5_000 },
  [QueueName.INVENTORY_SYNC]: { concurrency: 8, attempts: 3, backoffMs: 2_000 },
  [QueueName.NOTIFICATION]: { concurrency: 20, attempts: 3, backoffMs: 3_000 },
  [QueueName.CHANNEL_SYNC]: { concurrency: 4, attempts: 5, backoffMs: 10_000 },
  [QueueName.IMPORT_EXPORT]: { concurrency: 2, attempts: 1, backoffMs: 0 },
  [QueueName.MEDIA_PROCESS]: { concurrency: 6, attempts: 3, backoffMs: 3_000 },
  [QueueName.REPORT_GENERATION]: { concurrency: 3, attempts: 2, backoffMs: 5_000 },
  [QueueName.PROVISIONING]: { concurrency: 2, attempts: 5, backoffMs: 15_000 },
  [QueueName.SUBSCRIPTION_BILLING]: { concurrency: 4, attempts: 6, backoffMs: 30_000 },
  [QueueName.ANALYTICS_ROLLUP]: { concurrency: 2, attempts: 2, backoffMs: 10_000 },
  [QueueName.COMMISSION]: { concurrency: 4, attempts: 5, backoffMs: 5_000 },
  // attempts: 1 — retries here are not BullMQ's job (a transient DNS timeout or
  // ACME hiccup), they are DomainService's own explicit re-enqueue on a
  // backoff schedule that reasons about the 72h ownership window and can
  // mark the domain FAILED with a merchant-facing reason. A generic BullMQ
  // retry would just silently retry the same instant with no such context.
  [QueueName.DOMAIN_VERIFICATION]: { concurrency: 4, attempts: 1, backoffMs: 0 },
  [QueueName.DEAD_LETTER]: { concurrency: 1, attempts: 1, backoffMs: 0 },
};

/**
 * Event type → queue.
 *
 * A prefix map rather than an exhaustive list, so a new `order.*` event routes
 * correctly without a code change here. Unmatched events go to `dead-letter`,
 * where they are visible in the admin UI — silently discarding an unroutable
 * event is how a missing subscriber goes unnoticed for weeks.
 */
export const EVENT_ROUTING: readonly { prefix: string; queues: QueueName[] }[] = [
  { prefix: 'order.', queues: [QueueName.ORDER_LIFECYCLE, QueueName.NOTIFICATION, QueueName.ANALYTICS_ROLLUP] },
  { prefix: 'payment.', queues: [QueueName.PAYMENT_RECONCILE, QueueName.NOTIFICATION] },
  { prefix: 'refund.', queues: [QueueName.PAYMENT_RECONCILE, QueueName.NOTIFICATION] },
  { prefix: 'inventory.', queues: [QueueName.INVENTORY_SYNC, QueueName.NOTIFICATION] },
  { prefix: 'product.', queues: [QueueName.CHANNEL_SYNC] },
  { prefix: 'shipment.', queues: [QueueName.NOTIFICATION] },
  { prefix: 'tenant.', queues: [QueueName.PROVISIONING, QueueName.NOTIFICATION] },
  // Also to PROVISIONING: `subscription.started` is what kicks off store creation, so the
  // saga begins when a plan is chosen rather than at registration. The processor filters
  // the other subscription events out.
  {
    prefix: 'subscription.',
    queues: [QueueName.SUBSCRIPTION_BILLING, QueueName.NOTIFICATION, QueueName.PROVISIONING],
  },
  { prefix: 'domain.', queues: [QueueName.PROVISIONING] },
  { prefix: 'commission.', queues: [QueueName.COMMISSION] },
  { prefix: 'settlement.', queues: [QueueName.COMMISSION] },
  { prefix: 'channel.', queues: [QueueName.CHANNEL_SYNC] },
  { prefix: 'customer.', queues: [QueueName.NOTIFICATION] },
  { prefix: 'review.', queues: [QueueName.NOTIFICATION] },
];

export function queuesForEvent(eventType: string): QueueName[] {
  const match = EVENT_ROUTING.find((route) => eventType.startsWith(route.prefix));
  return match ? match.queues : [QueueName.DEAD_LETTER];
}
