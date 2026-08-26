import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3 } from './base.entity';
import { ProductEntity } from './product.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

@Entity('product_variants')
@TenantScoped()
export class ProductVariantEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Index('idx_variants_product')
  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId!: string;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode!: string | null;

  /** Display label, e.g. "Blue / Large". Derived from `optionValues` when not set explicitly. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ name: 'option_values', type: 'json' })
  optionValues!: Record<string, string>;

  /** SHA-256 of the sorted option entries — the real duplicate-combination guard is the DB unique key on this. */
  @Column({ name: 'option_signature', type: 'char', length: 64 })
  optionSignature!: string;

  @Column({ name: 'price_minor', type: 'bigint' })
  priceMinor!: string;

  @Column({ name: 'compare_price_minor', type: 'bigint', nullable: true })
  comparePriceMinor!: string | null;

  @Column({ name: 'cost_price_minor', type: 'bigint', nullable: true })
  costPriceMinor!: string | null;

  @Column({ name: 'weight_grams', type: 'int', unsigned: true, nullable: true })
  weightGrams!: number | null;

  @Column({ name: 'image_id', type: 'bigint', unsigned: true, nullable: true })
  imageId!: string | null;

  @Column({ type: 'smallint', default: 0 })
  position!: number;

  @Column({ name: 'is_active', ...BOOLEAN_COLUMN, default: 1 })
  isActive!: boolean;

  @Column({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;
}
