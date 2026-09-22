import { Column, Entity, PrimaryColumn } from 'typeorm';
import { DATETIME3 } from './base.entity';

/** One row per marketing-site section. See `PlatformWebsiteService` for each key's shape. */
export const WEBSITE_CONTENT_KEYS = [
  'hero',
  'features',
  'header',
  'footer',
  'plans_display',
  'about',
  'products',
  'career',
  'contact',
] as const;
export type WebsiteContentKey = (typeof WEBSITE_CONTENT_KEYS)[number];

/**
 * Public marketing website copy (`apps/marketing`), editable from the super-admin
 * console's Website module without a redeploy. Same key-value shape as
 * `PlatformSettingEntity` — one JSON row per section — because the access pattern is
 * identical: a handful of named, independently-editable blobs, not a query surface.
 */
@Entity('website_content')
export class WebsiteContentEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: WebsiteContentKey;

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
