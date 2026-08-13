import { Column, Entity, PrimaryColumn } from 'typeorm';
import { NumericIdEntity, DATETIME3 } from './base.entity';

export const ACTOR_TYPES = [
  'USER',
  'CUSTOMER',
  'SYSTEM',
  'PLATFORM_ADMIN',
  'API_KEY',
] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/**
 * Append-only audit trail for privileged mutations.
 *
 * Deliberately **not** tenant-FK'd and **not** in `PLATFORM_GLOBAL_ENTITIES` by
 * accident: audit rows must survive tenant deletion, because the most
 * compliance-relevant question is often "what did they do before they left?"
 * A `FOREIGN KEY … ON DELETE CASCADE` would erase exactly the records an
 * investigation needs.
 *
 * The table is `RANGE` partitioned quarterly in the migration, which turns
 * retention pruning into a metadata-only `DROP PARTITION` instead of a
 * multi-million-row `DELETE` that would hold locks for hours.
 */
@Entity('audit_logs')
export class AuditLogEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 32 })
  actorType!: ActorType;

  @Column({ name: 'actor_id', type: 'bigint', unsigned: true, nullable: true })
  actorId!: string | null;

  /**
   * Snapshot, not a join. The actor may be deleted later, and an audit row that
   * reads "user 4471 did X" after that user is gone is useless to an investigator.
   */
  @Column({ name: 'actor_email', type: 'varchar', length: 255, nullable: true })
  actorEmail!: string | null;

  /** `product.updated`, `order.refunded`, `user.role_granted`. */
  @Column({ type: 'varchar', length: 120 })
  action!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'bigint', unsigned: true, nullable: true })
  entityId!: string | null;

  @Column({ name: 'before_state', type: 'json', nullable: true })
  beforeState!: Record<string, unknown> | null;

  @Column({ name: 'after_state', type: 'json', nullable: true })
  afterState!: Record<string, unknown> | null;

  /** Pre-computed diff keys, so the UI does not have to compare two JSON blobs. */
  @Column({ name: 'changed_fields', type: 'json', nullable: true })
  changedFields!: string[] | null;

  @Column({ name: 'ip_address', type: 'varbinary', length: 16, nullable: true })
  ipAddress!: Buffer | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'correlation_id', type: 'char', length: 26, nullable: true })
  correlationId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'INFO' })
  severity!: 'INFO' | 'WARNING' | 'CRITICAL';

  /**
   * Part of the primary key, because MySQL requires every unique key of a
   * partitioned table to contain the partitioning column. Declared `@PrimaryColumn`
   * so TypeORM's metadata matches the real PK — otherwise an ORM-issued UPDATE
   * would target `WHERE id = ?` alone and could match across partitions.
   */
  @PrimaryColumn({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;
}
