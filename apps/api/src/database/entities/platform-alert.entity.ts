import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME3 } from './base.entity';

export const PLATFORM_ALERT_TYPES = [
  'INFRA_DOWN',
  'QUEUE_FAILURE_SPIKE',
  'PAYMENT_FAILURE',
  'QUOTA_THRESHOLD',
  'SUPPORT_SLA_BREACH',
  'TRIAL_EXPIRING',
] as const;
export type PlatformAlertType = (typeof PLATFORM_ALERT_TYPES)[number];

export const PLATFORM_ALERT_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type PlatformAlertSeverity = (typeof PLATFORM_ALERT_SEVERITIES)[number];

export const PLATFORM_ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED'] as const;
export type PlatformAlertStatus = (typeof PLATFORM_ALERT_STATUSES)[number];

/**
 * See the owning migration's doc comment for why `dedupeKey` is unique and
 * `tenantId` carries no FK.
 */
@Entity('platform_alerts')
export class PlatformAlertEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  type!: PlatformAlertType;

  @Index('uq_platform_alerts_dedupe_key', { unique: true })
  @Column({ name: 'dedupe_key', type: 'varchar', length: 191 })
  dedupeKey!: string;

  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  severity!: PlatformAlertSeverity;

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  status!: PlatformAlertStatus;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'first_seen_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  firstSeenAt!: Date;

  @Column({
    name: 'last_seen_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  lastSeenAt!: Date;

  @Column({ name: 'acknowledged_at', ...DATETIME3, nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ name: 'acknowledged_by', type: 'bigint', unsigned: true, nullable: true })
  acknowledgedBy!: string | null;

  @Column({ name: 'resolved_at', ...DATETIME3, nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'resolved_by', type: 'bigint', unsigned: true, nullable: true })
  resolvedBy!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;
}
