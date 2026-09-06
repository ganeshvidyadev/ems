import { Column, Entity, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const THEME_CATEGORIES = [
  'fashion',
  'electronics',
  'grocery',
  'furniture',
  'jewelry',
  'pharmacy',
  'restaurant',
  'handmade',
  'general',
] as const;
export type ThemeCategory = (typeof THEME_CATEGORIES)[number];

export const THEME_TEMPLATE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ThemeTemplateStatus = (typeof THEME_TEMPLATE_STATUSES)[number];

/**
 * Platform-owned template catalogue — the gallery merchants pick from. Not
 * tenant-scoped: every tenant sees the same nine templates, the same way
 * every tenant sees the same `plans` catalogue.
 */
@Entity('theme_templates')
export class ThemeTemplateEntity {
  // INT UNSIGNED, not the usual BIGINT `NumericIdEntity` gives every other
  // table — same reasoning `PlanEntity` documents for its own id: mysql2
  // returns a plain INT as a JS `number`, not a string, so this stays a
  // `number` rather than following the string convention everywhere else.
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  category!: ThemeCategory;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'preview_url', type: 'varchar', length: 500, nullable: true })
  previewUrl!: string | null;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 500, nullable: true })
  thumbnailUrl!: string | null;

  @Column({ name: 'demo_url', type: 'varchar', length: 500, nullable: true })
  demoUrl!: string | null;

  @Column({ name: 'is_premium', ...BOOLEAN_COLUMN, default: 0 })
  isPremium!: boolean;

  @Column({ name: 'price_minor', type: 'bigint', default: 0 })
  priceMinor!: string;

  /** Gates a premium theme by plan — NULL means available on every plan. */
  @Column({ name: 'min_plan_id', type: 'int', unsigned: true, nullable: true })
  minPlanId!: number | null;

  @Column({ name: 'default_config', type: 'json' })
  defaultConfig!: Record<string, unknown>;

  @Column({ name: 'schema_version', type: 'smallint', default: 1 })
  schemaVersion!: number;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: ThemeTemplateStatus;

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

export const TENANT_THEME_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type TenantThemeStatus = (typeof TENANT_THEME_STATUSES)[number];

/**
 * A tenant's own customized copy, cloned from a `ThemeTemplateEntity` at
 * selection time — a later change to the template must never mutate a live
 * store the merchant never opted to update.
 *
 * `config` is the draft a merchant is actively editing; `publishedConfig` is
 * the immutable snapshot the storefront actually renders. Splitting the two
 * is what makes "a saved draft is invisible to shoppers until published"
 * (the Phase 7 exit criterion) a data-shape guarantee rather than a
 * discipline the code has to remember to uphold.
 */
@Entity('tenant_themes')
@TenantScoped()
export class TenantThemeEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Column({ name: 'template_id', type: 'int', unsigned: true })
  templateId!: number;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'json' })
  config!: Record<string, unknown>;

  @Column({ name: 'custom_css', type: 'mediumtext', nullable: true })
  customCss!: string | null;

  @Column({ name: 'custom_head_html', type: 'text', nullable: true })
  customHeadHtml!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: TenantThemeStatus;

  @Column({ name: 'published_at', ...DATETIME3, nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'published_config', type: 'json', nullable: true })
  publishedConfig!: Record<string, unknown> | null;

  @VersionColumn({ name: 'version', type: 'int', unsigned: true, default: 0 })
  version!: number;

  get isLive(): boolean {
    return this.status === 'PUBLISHED' && this.publishedConfig !== null;
  }
}
