import { Column, Entity } from 'typeorm';
import { BaseEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const BLOG_POST_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type BlogPostStatus = (typeof BLOG_POST_STATUSES)[number];

@Entity('blog_posts')
@TenantScoped()
export class BlogPostEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Column({ type: 'varchar', length: 255 })
  slug!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  excerpt!: string | null;

  /** Sanitized on write — see `HtmlSanitizerService`. */
  @Column({ name: 'content_html', type: 'mediumtext', nullable: true })
  contentHtml!: string | null;

  @Column({ name: 'cover_image_url', type: 'varchar', length: 1000, nullable: true })
  coverImageUrl!: string | null;

  @Column({ name: 'author_id', type: 'bigint', unsigned: true, nullable: true })
  authorId!: string | null;

  @Column({ name: 'author_name', type: 'varchar', length: 120, nullable: true })
  authorName!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  category!: string | null;

  @Column({ type: 'json', nullable: true })
  tags!: string[] | null;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: BlogPostStatus;

  @Column({ name: 'view_count', type: 'int', unsigned: true, default: 0 })
  viewCount!: number;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'varchar', length: 500, nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'published_at', ...DATETIME3, nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;
}
