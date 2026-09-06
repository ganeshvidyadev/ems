import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

export const PRODUCT_SHARE_STATUSES = ['PENDING', 'ACTIVE', 'PAUSED', 'REJECTED', 'REVOKED'] as const;
export type ProductShareStatus = (typeof PRODUCT_SHARE_STATUSES)[number];

export const COMMISSION_TYPES = ['PERCENTAGE', 'FIXED', 'MARGIN'] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

export const INVENTORY_MODES = ['SHARED', 'ALLOCATED'] as const;
export type InventoryMode = (typeof INVENTORY_MODES)[number];

/**
 * One supplier's offer of one product to one reseller.
 *
 * Deliberately **not** `@TenantScoped()`: a row belongs equally to two
 * tenants (`supplierTenantId`, `resellerTenantId`), and neither side may
 * "own" it for the guard subscriber's single-column model. Cross-tenant
 * authorization is enforced explicitly in `ProductShareService` instead —
 * see `PLATFORM_GLOBAL_ENTITIES` for the same reasoning applied here.
 *
 * `productId` points at the **supplier's** product row — there is no
 * separate reseller-side clone (docs/02 §16's `product_shares.product_id`
 * FK is singular, to `products`, not duplicated per reseller). The
 * reseller's storefront reads the supplier's product directly, gated by
 * this row's `status`.
 */
@Entity('product_shares')
export class ProductShareEntity extends BaseEntity {
  @Column({ name: 'supplier_tenant_id', type: 'bigint', unsigned: true })
  supplierTenantId!: string;

  @Index('idx_product_shares_reseller')
  @Column({ name: 'reseller_tenant_id', type: 'bigint', unsigned: true })
  resellerTenantId!: string;

  @Index('idx_product_shares_product')
  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: ProductShareStatus;

  @Column({ name: 'commission_type', type: 'varchar', length: 32, default: 'PERCENTAGE' })
  commissionType!: CommissionType;

  /** Percent (0-100) for PERCENTAGE, minor-currency flat amount per unit for FIXED; unused for MARGIN. */
  @Column({ name: 'commission_value', type: 'decimal', precision: 12, scale: 4 })
  commissionValue!: string;

  @Column({ name: 'platform_fee_rate', type: 'decimal', precision: 7, scale: 4, default: 0 })
  platformFeeRate!: string;

  @Column({ name: 'reseller_price_minor', type: 'bigint', nullable: true })
  resellerPriceMinor!: string | null;

  /** The supplier's MAP floor — a reseller price below this is rejected. */
  @Column({ name: 'min_price_minor', type: 'bigint', nullable: true })
  minPriceMinor!: string | null;

  @Column({ name: 'allow_price_override', type: 'tinyint', width: 1, default: 0 })
  allowPriceOverride!: boolean;

  @Column({ name: 'inventory_mode', type: 'varchar', length: 32, default: 'SHARED' })
  inventoryMode!: InventoryMode;

  @Column({ name: 'allocated_quantity', type: 'int', unsigned: true, nullable: true })
  allocatedQuantity!: number | null;

  @Column({ name: 'requested_by', type: 'bigint', unsigned: true, nullable: true })
  requestedBy!: string | null;

  @Column({ name: 'approved_by', type: 'bigint', unsigned: true, nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: 'datetime', precision: 3, nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'datetime', precision: 3, nullable: true })
  revokedAt!: Date | null;

  get isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
