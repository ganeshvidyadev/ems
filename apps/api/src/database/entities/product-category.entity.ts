import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { BOOLEAN_COLUMN } from './base.entity';
import { ProductEntity } from './product.entity';
import { CategoryEntity } from './category.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

/**
 * Product ⇄ category junction. Carries `tenant_id` directly (unlike `user_roles`), so it
 * is `@TenantScoped()` rather than allowlisted as transitively-scoped.
 */
@Entity('product_categories')
@TenantScoped()
export class ProductCategoryEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @PrimaryColumn({ name: 'product_id', type: 'bigint', unsigned: true })
  productId!: string;

  @Index('idx_product_categories_category')
  @PrimaryColumn({ name: 'category_id', type: 'bigint', unsigned: true })
  categoryId!: string;

  /** Drives the canonical breadcrumb and URL when a product belongs to several categories. */
  @Column({ name: 'is_primary', ...BOOLEAN_COLUMN, default: 0 })
  isPrimary!: boolean;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @ManyToOne(() => CategoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;
}
