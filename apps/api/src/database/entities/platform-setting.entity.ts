import { Column, Entity, PrimaryColumn } from 'typeorm';
import { DATETIME3 } from './base.entity';

/** Well-known keys this codebase actually reads — an unrecognized key can still
 * be stored (the column is a generic VARCHAR), but only these are wired to
 * behavior. See `PlatformSettingsService` for each key's shape and consumers. */
export const PLATFORM_SETTING_KEYS = ['maintenance_mode', 'support_sla_hours'] as const;
export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[number];

@Entity('platform_settings')
export class PlatformSettingEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: PlatformSettingKey;

  @Column({ type: 'json' })
  value!: unknown;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;

  @Column({ name: 'updated_by', type: 'bigint', unsigned: true, nullable: true })
  updatedBy!: string | null;
}
