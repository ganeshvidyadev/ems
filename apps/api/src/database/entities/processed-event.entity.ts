import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { DATETIME3 } from './base.entity';

/**
 * Consumer-side idempotency ledger.
 *
 * The outbox relay guarantees **at-least-once** delivery, which makes duplicate
 * delivery a certainty over time, not a possibility: a consumer that succeeds but
 * dies before acknowledging will be handed the same event again. Without this
 * table, that duplicate charges a card twice or decrements stock twice.
 *
 * The composite PK is the whole mechanism — a consumer inserts here inside the
 * same transaction as its side effect, and a duplicate delivery fails the insert
 * on the unique key instead of repeating the work.
 *
 * Platform-global: keyed by event id, and it must outlive tenant deletion so a
 * late redelivery cannot be reprocessed.
 */
@Entity('processed_events')
export class ProcessedEventEntity {
  @PrimaryColumn({ name: 'consumer_name', type: 'varchar', length: 120 })
  consumerName!: string;

  @PrimaryColumn({ name: 'event_id', type: 'char', length: 26 })
  eventId!: string;

  @Index('idx_processed_events_cleanup')
  @Column({ name: 'processed_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  processedAt!: Date;

  /** OK | SKIPPED | FAILED_TERMINAL — distinguishes "done" from "deliberately ignored". */
  @Column({ type: 'varchar', length: 32, default: 'OK' })
  result!: string;
}
