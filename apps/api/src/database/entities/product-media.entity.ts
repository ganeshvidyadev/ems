import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BOOLEAN_COLUMN, DATETIME3, NumericIdEntity } from './base.entity';
import { ProductEntity } from './product.entity';
import { ProductVariantEntity } from './product-variant.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const PRODUCT_MEDIA_TYPES = ['IMAGE', 'VIDEO', 'MODEL_3D', 'DOCUMENT'] as const;
export type ProductMediaType = (typeof PRODUCT_MEDIA_TYPES)[number];

/** Presigned-upload lifecycle: `PENDING` (URL issued) → `READY` (processed) or `FAILED`. */
export const PRODUCT_MEDIA_STATUSES = ['PENDING', 'READY', 'FAILED'] as const;
export type ProductMediaStatus = (typeof PRODUCT_MEDIA_STATUSES)[number];

/** No soft delete — a removed image's row and S3 object are both deleted for real. */
@Entity('product_media')
@TenantScoped()
export class ProductMediaEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Index('idx_product_media_product')
  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId!: string;

  @Index('idx_product_media_variant')
  @Column({ name: 'variant_id', type: 'bigint', unsigned: true, nullable: true })
  variantId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'IMAGE' })
  type!: ProductMediaType;

  @Column({ type: 'varchar', length: 1000 })
  url!: string;

  /** S3 object key — needed to delete or reprocess without re-deriving it from the URL. */
  @Column({ name: 'storage_key', type: 'varchar', length: 500 })
  storageKey!: string;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 1000, nullable: true })
  thumbnailUrl!: string | null;

  @Column({ name: 'alt_text', type: 'varchar', length: 255, nullable: true })
  altText!: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'size_bytes', type: 'bigint', unsigned: true, nullable: true })
  sizeBytes!: string | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  width!: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  height!: number | null;

  @Column({ name: 'duration_sec', type: 'int', unsigned: true, nullable: true })
  durationSec!: number | null;

  @Column({ type: 'smallint', default: 0 })
  position!: number;

  @Column({ name: 'is_primary', ...BOOLEAN_COLUMN, default: 0 })
  isPrimary!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: ProductMediaStatus;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @ManyToOne(() => ProductVariantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variant_id' })
  variant?: ProductVariantEntity | null;
}
