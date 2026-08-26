import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

/**
 * Adjacency list + materialized `path` ('/1/14/57/').
 *
 * `path`/`depth` are maintained by `CategoryService.move()`, not a DB trigger — MySQL
 * has no recursive-update trigger primitive, and doing it in the service keeps the
 * recomputation inside the same transaction as the parent change.
 */
@Entity('categories')
@TenantScoped()
export class CategoryEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true, nullable: true })
  storeId!: string | null;

  @Index('idx_categories_tenant_parent')
  @Column({ name: 'parent_id', type: 'bigint', unsigned: true, nullable: true })
  parentId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  slug!: string;

  @Column({ type: 'varchar', length: 1000 })
  path!: string;

  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  depth!: number;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'banner_url', type: 'varchar', length: 500, nullable: true })
  bannerUrl!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  /** Denormalized live-product count. Recounted transactionally on every category link change. */
  @Column({ name: 'product_count', type: 'int', unsigned: true, default: 0 })
  productCount!: number;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'varchar', length: 500, nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'is_active', ...BOOLEAN_COLUMN, default: 1 })
  isActive!: boolean;

  @Column({ name: 'show_in_menu', ...BOOLEAN_COLUMN, default: 1 })
  showInMenu!: boolean;

  @Column({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => CategoryEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parent_id' })
  parent?: CategoryEntity | null;
}
