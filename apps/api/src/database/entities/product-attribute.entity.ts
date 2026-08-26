import { newPublicId } from '@ems/kernel';
import { BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BOOLEAN_COLUMN, DATETIME3, NumericIdEntity } from './base.entity';
import { ProductEntity } from './product.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const ATTRIBUTE_INPUT_TYPES = [
  'SELECT',
  'MULTISELECT',
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'COLOR',
] as const;
export type AttributeInputType = (typeof ATTRIBUTE_INPUT_TYPES)[number];

/**
 * The attribute registry. Exists alongside `products.attributes` JSON on purpose — JSON is
 * for display-only specs, this table is for anything faceted/filtered, because MySQL
 * cannot efficiently filter "color IN ('Red','Blue') AND size='L'" over JSON.
 */
@Entity('product_attributes')
@TenantScoped()
export class ProductAttributeEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'public_id', type: 'char', length: 26 })
  publicId!: string;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'input_type', type: 'varchar', length: 32, default: 'SELECT' })
  inputType!: AttributeInputType;

  /** True for attributes usable as a variant option (color, size). */
  @Column({ name: 'is_variant_option', ...BOOLEAN_COLUMN, default: 0 })
  isVariantOption!: boolean;

  @Column({ name: 'is_filterable', ...BOOLEAN_COLUMN, default: 1 })
  isFilterable!: boolean;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder!: number;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @BeforeInsert()
  protected assignPublicId(): void {
    if (!this.publicId) this.publicId = newPublicId();
  }
}

@Entity('product_attribute_values')
@TenantScoped()
export class ProductAttributeValueEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Index('idx_pav_product')
  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId!: string;

  @Index('idx_pav_facet')
  @Column({ name: 'attribute_id', type: 'bigint', unsigned: true })
  attributeId!: string;

  @Column({ name: 'value_text', type: 'varchar', length: 500, nullable: true })
  valueText!: string | null;

  @Column({ name: 'value_number', type: 'decimal', precision: 18, scale: 4, nullable: true })
  valueNumber!: string | null;

  @Column({ name: 'value_bool', ...BOOLEAN_COLUMN, nullable: true })
  valueBool!: boolean | null;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @ManyToOne(() => ProductAttributeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_id' })
  attribute?: ProductAttributeEntity;
}
