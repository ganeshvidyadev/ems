import { Column, DeleteDateColumn, Entity, VersionColumn } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const PRODUCT_TYPES = ['SIMPLE', 'VARIABLE', 'DIGITAL', 'BUNDLE', 'SERVICE'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED', 'OUT_OF_STOCK'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_VISIBILITIES = ['VISIBLE', 'HIDDEN', 'SEARCH_ONLY', 'CATALOG_ONLY'] as const;
export type ProductVisibility = (typeof PRODUCT_VISIBILITIES)[number];

/**
 * The catalog aggregate root. `version` is optimistically-locked (TypeORM `@VersionColumn`)
 * because a merchant editing price in one tab while a bulk import touches the same row in
 * another is a real conflict, and a lost update on price is worse than a 409.
 */
@Entity('products')
@TenantScoped()
export class ProductEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Column({ name: 'brand_id', type: 'bigint', unsigned: true, nullable: true })
  brandId!: string | null;

  @Column({ name: 'tax_class_id', type: 'bigint', unsigned: true, nullable: true })
  taxClassId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'SIMPLE' })
  type!: ProductType;

  @Column({ type: 'varchar', length: 500 })
  name!: string;

  @Column({ type: 'varchar', length: 500 })
  slug!: string;

  /** NULL for VARIABLE products — SKU lives on each variant instead. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  sku!: string | null;

  @Column({ name: 'short_description', type: 'varchar', length: 1000, nullable: true })
  shortDescription!: string | null;

  @Column({ type: 'mediumtext', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: ProductStatus;

  @Column({ type: 'varchar', length: 32, default: 'VISIBLE' })
  visibility!: ProductVisibility;

  @Column({ name: 'price_minor', type: 'bigint', default: 0 })
  priceMinor!: string;

  @Column({ name: 'compare_price_minor', type: 'bigint', nullable: true })
  comparePriceMinor!: string | null;

  /** Margin reporting only — never returned by a storefront-facing endpoint. */
  @Column({ name: 'cost_price_minor', type: 'bigint', nullable: true })
  costPriceMinor!: string | null;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency!: string;

  @Column({ name: 'track_inventory', ...BOOLEAN_COLUMN, default: 1 })
  trackInventory!: boolean;

  @Column({ name: 'allow_backorder', ...BOOLEAN_COLUMN, default: 0 })
  allowBackorder!: boolean;

  @Column({ name: 'low_stock_threshold', type: 'int', unsigned: true, nullable: true })
  lowStockThreshold!: number | null;

  @Column({ name: 'weight_grams', type: 'int', unsigned: true, nullable: true })
  weightGrams!: number | null;

  @Column({ name: 'length_mm', type: 'int', unsigned: true, nullable: true })
  lengthMm!: number | null;

  @Column({ name: 'width_mm', type: 'int', unsigned: true, nullable: true })
  widthMm!: number | null;

  @Column({ name: 'height_mm', type: 'int', unsigned: true, nullable: true })
  heightMm!: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode!: string | null;

  /** GST HSN classification (India). */
  @Column({ name: 'hsn_code', type: 'varchar', length: 20, nullable: true })
  hsnCode!: string | null;

  @Column({ name: 'requires_shipping', ...BOOLEAN_COLUMN, default: 1 })
  requiresShipping!: boolean;

  @Column({ name: 'is_featured', ...BOOLEAN_COLUMN, default: 0 })
  isFeatured!: boolean;

  /** Opt-in to marketplace resale (Phase 9). */
  @Column({ name: 'is_shareable', ...BOOLEAN_COLUMN, default: 0 })
  isShareable!: boolean;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'varchar', length: 500, nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'meta_keywords', type: 'varchar', length: 500, nullable: true })
  metaKeywords!: string | null;

  /** Unfiltered display specs only — anything filterable lives in `product_attribute_values`. */
  @Column({ type: 'json', nullable: true })
  attributes!: Record<string, unknown> | null;

  @Column({ name: 'rating_average', type: 'decimal', precision: 3, scale: 2, default: '0.00' })
  ratingAverage!: string;

  @Column({ name: 'rating_count', type: 'int', unsigned: true, default: 0 })
  ratingCount!: number;

  @Column({ name: 'total_sold', type: 'int', unsigned: true, default: 0 })
  totalSold!: number;

  @Column({ name: 'published_at', ...DATETIME3, nullable: true })
  publishedAt!: Date | null;

  @VersionColumn({ name: 'version', type: 'int', unsigned: true, default: 0 })
  version!: number;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  // `@DeleteDateColumn`, not a plain `@Column` — a bare column with this name
  // looks identical at the database level but carries no TypeORM soft-delete
  // metadata, so `repository.softRemove()` (what `TenantScopedRepository
  // .softDeleteByPublicId` calls) throws `MissingDeleteDateColumnError`
  // instead of ever issuing an UPDATE. Found live: every `DELETE
  // /console/products/:id` call has 500'd since this table's own `deleted_at`
  // column was added — nothing had exercised product deletion over real HTTP
  // until now.
  @DeleteDateColumn({ name: 'deleted_at', ...DATETIME3 })
  deletedAt!: Date | null;

  get isLive(): boolean {
    return this.deletedAt === null || this.deletedAt === undefined;
  }
}
