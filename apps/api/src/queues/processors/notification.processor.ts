import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import type { EntityManager } from 'typeorm';
import { REDIS_QUEUE_CLIENT } from '../../common/redis/redis.module';
import { RequestContextService } from '../../common/services/request-context.service';
import { NotificationDispatchService } from '../../modules/notification/notification-dispatch.service';
import { QUEUE_SETTINGS, QueueName } from '../queue-names.enum';

interface NotificationJobData {
  eventId?: string;
  eventType?: string;
  aggregateId?: string;
  tenantId?: string | null;
  correlationId?: string | null;
  payload?: Record<string, unknown>;
}

interface TenantOwnerContact {
  userId: string;
  email: string;
  firstName: string;
}

interface OrderContact {
  orderNumber: string;
  email: string | null;
  totalMinor: string;
  currency: string;
}

type Recipient = { type: 'USER'; id: string; address: string; name: string } | { type: 'CUSTOMER'; address: string };

interface EventNotificationSpec {
  templateCode: string;
  channels: readonly ('EMAIL' | 'IN_APP')[];
  resolve: (
    processor: NotificationProcessor,
    tx: EntityManager,
    tenantId: string | null,
    payload: Record<string, unknown>,
    aggregateId?: string,
  ) => Promise<{ recipient: Recipient; variables: Record<string, string> } | null>;
}

/**
 * Consumes the `notification` queue — every event the outbox routes here
 * (see `EVENT_ROUTING`) plus the ones this phase's own code newly emits
 * (`order.placed`, `shipment.dispatched/delivered`).
 *
 * Idempotent via `processed_events`, exactly the ledger `OutboxRelayService`'s
 * own doc comment says every consumer must use: the relay is at-least-once,
 * so a redelivered event must not send a second email. The insert and the
 * dedup check happen inside one transaction; a duplicate-key violation means
 * "already handled" and the job completes as a no-op rather than retrying.
 *
 * An event type with no entry in `EVENT_NOTIFICATIONS` is routed here by
 * `EVENT_ROUTING`'s prefix match but has nothing configured yet (e.g.
 * `subscription.started`, `subscription.cancel_scheduled`) — it completes
 * silently rather than failing the job.
 */
@Injectable()
export class NotificationProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_QUEUE_CLIENT) private readonly connection: Redis,
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly dispatch: NotificationDispatchService,
    private readonly context: RequestContextService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.EMS_ROLE !== 'worker') return;

    const settings = QUEUE_SETTINGS[QueueName.NOTIFICATION];
    this.worker = new Worker<NotificationJobData>(QueueName.NOTIFICATION, (job) => this.handle(job), {
      connection: this.connection,
      concurrency: settings.concurrency,
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Notification job ${job?.id ?? '?'} (${job?.name ?? '?'}) failed: ${error.message}`);
    });

    this.logger.log(`Notification worker listening (concurrency ${settings.concurrency})`);
  }

  private async handle(job: Job<NotificationJobData>): Promise<void> {
    const { eventId, eventType, aggregateId, tenantId, payload = {}, correlationId } = job.data;
    if (!eventId || !eventType) return;

    const spec = EVENT_NOTIFICATIONS[eventType];
    if (!spec) return;

    await this.context.run(
      {
        correlationId: correlationId ?? `notification-${job.id}`,
        tenantId: tenantId ?? null,
        surface: 'system',
        startedAt: Date.now(),
        causationId: eventId,
      },
      async () => {
        const claimed = await this.claim(eventId);
        if (!claimed) {
          this.logger.debug(`Event ${eventId} already processed by notification consumer; skipping`);
          return;
        }

        const resolved = await spec.resolve(this, this.manager, tenantId ?? null, payload, aggregateId);
        if (!resolved) return;

        for (const channel of spec.channels) {
          if (channel === 'IN_APP' && resolved.recipient.type !== 'USER') continue;

          await this.dispatch.dispatch({
            recipientType: resolved.recipient.type === 'USER' ? 'USER' : 'CUSTOMER',
            recipientId: resolved.recipient.type === 'USER' ? resolved.recipient.id : null,
            recipientAddress: resolved.recipient.address,
            channel,
            templateCode: spec.templateCode,
            variables: resolved.variables,
          });
        }
      },
    );
  }

  /** Inserts the idempotency row; `false` means a prior delivery already handled this event. */
  private async claim(eventId: string): Promise<boolean> {
    try {
      await this.manager.query(
        `INSERT INTO processed_events (consumer_name, event_id, result) VALUES (?, ?, 'OK')`,
        ['notification-dispatch', eventId],
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Duplicate entry') || message.includes('ER_DUP_ENTRY')) return false;
      throw error;
    }
  }

  async resolveTenantOwner(tx: EntityManager, tenantId: string | null): Promise<TenantOwnerContact | null> {
    if (!tenantId) return null;
    const rows = (await tx.query(
      `SELECT u.id AS userId, u.email AS email, u.first_name AS firstName
         FROM tenants t JOIN users u ON u.id = t.owner_user_id
        WHERE t.id = ?`,
      [tenantId],
    )) as TenantOwnerContact[];
    return rows[0] ?? null;
  }

  async resolveOrder(tx: EntityManager, orderId: unknown): Promise<OrderContact | null> {
    if (!orderId) return null;
    const rows = (await tx.query(
      `SELECT order_number AS orderNumber, email, total_minor AS totalMinor, currency FROM orders WHERE id = ?`,
      [orderId],
    )) as OrderContact[];
    return rows[0] ?? null;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}

const EVENT_NOTIFICATIONS: Record<string, EventNotificationSpec> = {
  'tenant.registered': {
    templateCode: 'TENANT_WELCOME',
    channels: ['EMAIL'],
    async resolve(_p, _tx, _tenantId, payload) {
      const email = payload['ownerEmail'] as string | undefined;
      if (!email) return null;
      return { recipient: { type: 'CUSTOMER', address: email }, variables: { businessName: String(payload['businessName'] ?? '') } };
    },
  },
  'tenant.provisioned': {
    templateCode: 'STORE_READY',
    channels: ['EMAIL', 'IN_APP'],
    async resolve(p, tx, tenantId) {
      const owner = await p.resolveTenantOwner(tx, tenantId);
      if (!owner) return null;
      return {
        recipient: { type: 'USER', id: owner.userId, address: owner.email, name: owner.firstName },
        variables: { firstName: owner.firstName },
      };
    },
  },
  'tenant.provisioning_failed': {
    templateCode: 'PROVISIONING_FAILED',
    channels: ['EMAIL', 'IN_APP'],
    async resolve(p, tx, tenantId, payload) {
      const owner = await p.resolveTenantOwner(tx, tenantId);
      if (!owner) return null;
      return {
        recipient: { type: 'USER', id: owner.userId, address: owner.email, name: owner.firstName },
        variables: { firstName: owner.firstName, message: String(payload['message'] ?? '') },
      };
    },
  },
  'subscription.renewed': {
    templateCode: 'SUBSCRIPTION_RENEWED',
    channels: ['EMAIL'],
    async resolve(p, tx, tenantId) {
      const owner = await p.resolveTenantOwner(tx, tenantId);
      if (!owner) return null;
      return { recipient: { type: 'USER', id: owner.userId, address: owner.email, name: owner.firstName }, variables: { firstName: owner.firstName } };
    },
  },
  'subscription.payment_failed': {
    templateCode: 'SUBSCRIPTION_PAYMENT_FAILED',
    channels: ['EMAIL', 'IN_APP'],
    async resolve(p, tx, tenantId) {
      const owner = await p.resolveTenantOwner(tx, tenantId);
      if (!owner) return null;
      return { recipient: { type: 'USER', id: owner.userId, address: owner.email, name: owner.firstName }, variables: { firstName: owner.firstName } };
    },
  },
  'subscription.suspended': {
    templateCode: 'SUBSCRIPTION_SUSPENDED',
    channels: ['EMAIL', 'IN_APP'],
    async resolve(p, tx, tenantId) {
      const owner = await p.resolveTenantOwner(tx, tenantId);
      if (!owner) return null;
      return { recipient: { type: 'USER', id: owner.userId, address: owner.email, name: owner.firstName }, variables: { firstName: owner.firstName } };
    },
  },
  'subscription.cancelled': {
    templateCode: 'SUBSCRIPTION_CANCELLED',
    channels: ['EMAIL'],
    async resolve(p, tx, tenantId) {
      const owner = await p.resolveTenantOwner(tx, tenantId);
      if (!owner) return null;
      return { recipient: { type: 'USER', id: owner.userId, address: owner.email, name: owner.firstName }, variables: { firstName: owner.firstName } };
    },
  },
  'subscription.reactivated': {
    templateCode: 'SUBSCRIPTION_REACTIVATED',
    channels: ['EMAIL'],
    async resolve(p, tx, tenantId) {
      const owner = await p.resolveTenantOwner(tx, tenantId);
      if (!owner) return null;
      return { recipient: { type: 'USER', id: owner.userId, address: owner.email, name: owner.firstName }, variables: { firstName: owner.firstName } };
    },
  },
  'payment.captured': {
    templateCode: 'BILLING_PAYMENT_RECEIVED',
    channels: ['EMAIL'],
    async resolve(p, tx, tenantId, payload) {
      const owner = await p.resolveTenantOwner(tx, tenantId);
      if (!owner) return null;
      return {
        recipient: { type: 'USER', id: owner.userId, address: owner.email, name: owner.firstName },
        variables: { firstName: owner.firstName, amountMinor: String(payload['amountMinor'] ?? '') },
      };
    },
  },
  'channel.token_expired': {
    templateCode: 'CHANNEL_TOKEN_EXPIRED',
    channels: ['EMAIL', 'IN_APP'],
    async resolve(p, tx, tenantId) {
      const owner = await p.resolveTenantOwner(tx, tenantId);
      if (!owner) return null;
      return { recipient: { type: 'USER', id: owner.userId, address: owner.email, name: owner.firstName }, variables: { firstName: owner.firstName } };
    },
  },
  'order.placed': {
    templateCode: 'ORDER_CONFIRMATION',
    channels: ['EMAIL'],
    async resolve(p, tx, _tenantId, _payload, aggregateId) {
      const order = await p.resolveOrder(tx, aggregateId);
      if (!order?.email) return null;
      return {
        recipient: { type: 'CUSTOMER', address: order.email },
        variables: { orderNumber: order.orderNumber, totalMinor: order.totalMinor, currency: order.currency },
      };
    },
  },
  'shipment.dispatched': {
    templateCode: 'SHIPMENT_DISPATCHED',
    channels: ['EMAIL'],
    async resolve(p, tx, _tenantId, payload) {
      const order = await p.resolveOrder(tx, payload['orderId']);
      if (!order?.email) return null;
      return {
        recipient: { type: 'CUSTOMER', address: order.email },
        variables: { orderNumber: order.orderNumber, carrier: String(payload['carrier'] ?? ''), awbNumber: String(payload['awbNumber'] ?? '') },
      };
    },
  },
  'shipment.delivered': {
    templateCode: 'SHIPMENT_DELIVERED',
    channels: ['EMAIL'],
    async resolve(p, tx, _tenantId, payload) {
      const order = await p.resolveOrder(tx, payload['orderId']);
      if (!order?.email) return null;
      return { recipient: { type: 'CUSTOMER', address: order.email }, variables: { orderNumber: order.orderNumber } };
    },
  },
};
