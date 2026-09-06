import { Column, Entity } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const CMS_PAGE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type CmsPageStatus = (typeof CMS_PAGE_STATUSES)[number];

@Entity('cms_pages')
@TenantScoped()
export class CmsPageEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Column({ type: 'varchar', length: 255 })
  slug!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** Sanitized on write — see `HtmlSanitizerService`; never trust what's stored to be safe on read. */
  @Column({ name: 'content_html', type: 'mediumtext', nullable: true })
  contentHtml!: string | null;

  @Column({ name: 'content_blocks', type: 'json', nullable: true })
  contentBlocks!: Record<string, unknown>[] | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  template!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: CmsPageStatus;

  /** Privacy policy / terms of service — undeletable, but still editable. */
  @Column({ name: 'is_system', ...BOOLEAN_COLUMN, default: 0 })
  isSystem!: boolean;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'varchar', length: 500, nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'canonical_url', type: 'varchar', length: 500, nullable: true })
  canonicalUrl!: string | null;

  @Column({ name: 'no_index', ...BOOLEAN_COLUMN, default: 0 })
  noIndex!: boolean;

  @Column({ name: 'published_at', ...DATETIME3, nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  @Column({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;
}
