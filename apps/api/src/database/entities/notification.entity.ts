import { Column, Entity, Index } from 'typeorm';
import { NumericIdEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';
import type { NotificationChannel } from './notification-template.entity';

export const NOTIFICATION_RECIPIENT_TYPES = ['USER', 'CUSTOMER', 'PLATFORM_ADMIN'] as const;
export type NotificationRecipientType = (typeof NOTIFICATION_RECIPIENT_TYPES)[number];

export const NOTIFICATION_STATUSES = [
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'BOUNCED',
  'SUPPRESSED',
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/**
 * One rendered, dispatched (or dispatch-attempted) message (docs/02 §18).
 *
 * Deliberately **not** `allowNullTenant`-globaled the way its own template
 * table is: every notification created by this phase's own dispatcher has a
 * real tenant (the event that triggered it always carries one). A genuine
 * `PLATFORM_ADMIN`-recipient notification with no tenant is a real, narrower
 * case this phase does not populate — left for a future pass rather than
 * bolting on an `isSystem`-style marker for a path nothing here exercises.
 */
@Entity('notifications')
@TenantScoped({ allowNullTenant: true })
export class NotificationEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'recipient_type', type: 'varchar', length: 32 })
  recipientType!: NotificationRecipientType;

  @Column({ name: 'recipient_id', type: 'bigint', unsigned: true, nullable: true })
  recipientId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  channel!: NotificationChannel;

  @Column({ name: 'template_code', type: 'varchar', length: 64, nullable: true })
  templateCode!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'action_url', type: 'varchar', length: 500, nullable: true })
  actionUrl!: string | null;

  @Index('idx_notifications_status')
  @Column({ type: 'varchar', length: 32, default: 'QUEUED' })
  status!: NotificationStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  provider!: string | null;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 191, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 500, nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  attempts!: number;

  @Index('idx_notifications_recipient')
  @Column({ name: 'read_at', ...DATETIME3, nullable: true })
  readAt!: Date | null;

  @Column({ name: 'sent_at', ...DATETIME3, nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'delivered_at', ...DATETIME3, nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'correlation_id', type: 'char', length: 26, nullable: true })
  correlationId!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  get isUnread(): boolean {
    return this.readAt === null;
  }
}
