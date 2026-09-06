import { Column, Entity, Index } from 'typeorm';
import { NumericIdEntity, DATETIME3, BOOLEAN_COLUMN } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * One (code, channel, locale) rendering — falls back to the platform default
 * (`tenant_id IS NULL`) when a tenant has not customized it (docs/02 §18).
 *
 * `isSystem` is the same marker `RoleEntity` carries for its own NULL-tenant
 * rows: `TenantGuardSubscriber` only lets a NULL-tenant insert through when
 * the entity proves it is deliberately global, and a seeded platform-default
 * template (inserted with no tenant context at all) needs exactly that proof.
 * A tenant's own override always has both `tenantId` set and `isSystem: false`.
 */
@Entity('notification_templates')
@TenantScoped({ allowNullTenant: true })
export class NotificationTemplateEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'is_system', ...BOOLEAN_COLUMN, default: 0 })
  isSystem!: boolean;

  /** `ORDER_PLACED`, `SHIPMENT_DISPATCHED`, `LOW_STOCK`, … — matches the outbox `eventType` it's rendered for. */
  @Index('idx_notif_templates_code')
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 16 })
  channel!: NotificationChannel;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  locale!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject!: string | null;

  /** `{{mustache}}`-style — see `TemplateRenderer` for the (hand-rolled; no Handlebars dependency available) engine. */
  @Column({ type: 'mediumtext' })
  body!: string;

  /** A DLT (SMS, India) or WhatsApp Business pre-approved template id — required by the real provider, not by this table. */
  @Column({ name: 'provider_template_id', type: 'varchar', length: 191, nullable: true })
  providerTemplateId!: string | null;

  /** Documents which `{{variables}}` this template expects — display-only, for a template-editor UI. */
  @Column({ type: 'json', nullable: true })
  variables!: string[] | null;

  @Column({ name: 'is_active', ...BOOLEAN_COLUMN, default: 1 })
  isActive!: boolean;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;
}
