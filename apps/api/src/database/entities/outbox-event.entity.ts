import { Column, Entity, Index } from 'typeorm';
import { NumericIdEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const OUTBOX_STATUSES = [
  'PENDING',
  'DISPATCHING',
  'DISPATCHED',
  'FAILED',
  'DEAD',
] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export interface OutboxMetadata {
  correlationId?: string;
  /** The event/command that caused this one — lets a chain be reconstructed. */
  causationId?: string;
  actorType?: string;
  actorId?: string;
  [key: string]: unknown;
}

/**
 * Transactional outbox row (docs/01 §6).
 *
 * Written **inside** the business transaction that changes state, so the event
 * and the state it describes commit together or not at all. An in-process
 * `EventEmitter` cannot offer that: it fires even when the surrounding
 * transaction later rolls back, and it loses the event entirely if the pod dies
 * between commit and emit. For "order placed → decrement stock → charge card",
 * both failure modes corrupt state in ways a merchant will notice.
 */
@Entity('outbox_events')
@TenantScoped({ allowNullTenant: true })
export class OutboxEventEntity extends NumericIdEntity {
  /** ULID. The idempotency key consumers deduplicate on. */
  @Index('uq_outbox_event_id', { unique: true })
  @Column({ name: 'event_id', type: 'char', length: 26 })
  eventId!: string;

  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 64 })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'bigint', unsigned: true })
  aggregateId!: string;

  /** Dotted name, e.g. `order.placed`, `payment.captured`. */
  @Column({ name: 'event_type', type: 'varchar', length: 120 })
  eventType!: string;

  /** Lets a consumer handle an old payload shape after the producer evolves. */
  @Column({ name: 'event_version', type: 'smallint', default: 1 })
  eventVersion!: number;

  @Column({ type: 'json' })
  payload!: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  metadata!: OutboxMetadata | null;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: OutboxStatus;

  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  attempts!: number;

  /** Backoff cursor — the relay only picks up rows whose time has come. */
  @Column({ name: 'available_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  availableAt!: Date;

  @Column({ name: 'dispatched_at', ...DATETIME3, nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'last_error', type: 'varchar', length: 1000, nullable: true })
  lastError!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;
}
