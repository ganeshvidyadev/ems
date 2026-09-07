import { Column, DeleteDateColumn, Entity } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const COUPON_DISCOUNT_TYPES = [
  'PERCENTAGE',
  'FIXED_AMOUNT',
  'FREE_SHIPPING',
  'BUY_X_GET_Y',
] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

export const COUPON_APPLIES_TO = ['ORDER', 'PRODUCTS', 'CATEGORIES', 'SHIPPING'] as const;
export type CouponAppliesTo = (typeof COUPON_APPLIES_TO)[number];

export const COUPON_ELIGIBILITIES = ['ALL', 'NEW', 'RETURNING', 'GROUP', 'SPECIFIC'] as const;
export type CouponEligibility = (typeof COUPON_ELIGIBILITIES)[number];

export const COUPON_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];

@Entity('coupons')
@TenantScoped()
export class CouponEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true, nullable: true })
  storeId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ name: 'discount_type', type: 'varchar', length: 32 })
  discountType!: CouponDiscountType;

  @Column({ name: 'discount_value', type: 'decimal', precision: 12, scale: 4 })
  discountValue!: string;

  @Column({ name: 'max_discount_minor', type: 'bigint', nullable: true })
  maxDiscountMinor!: string | null;

  @Column({ name: 'min_order_minor', type: 'bigint', nullable: true })
  minOrderMinor!: string | null;

  @Column({ name: 'applies_to', type: 'varchar', length: 32, default: 'ORDER' })
  appliesTo!: CouponAppliesTo;

  @Column({ name: 'target_ids', type: 'json', nullable: true })
  targetIds!: string[] | null;

  @Column({ name: 'excluded_ids', type: 'json', nullable: true })
  excludedIds!: string[] | null;

  @Column({ name: 'buy_quantity', type: 'int', unsigned: true, nullable: true })
  buyQuantity!: number | null;

  @Column({ name: 'get_quantity', type: 'int', unsigned: true, nullable: true })
  getQuantity!: number | null;

  @Column({ name: 'usage_limit_total', type: 'int', unsigned: true, nullable: true })
  usageLimitTotal!: number | null;

  @Column({ name: 'usage_limit_per_customer', type: 'int', unsigned: true, nullable: true })
  usageLimitPerCustomer!: number | null;

  @Column({ name: 'usage_count', type: 'int', unsigned: true, default: 0 })
  usageCount!: number;

  @Column({ name: 'customer_eligibility', type: 'varchar', length: 32, default: 'ALL' })
  customerEligibility!: CouponEligibility;

  @Column({ name: 'eligible_customer_ids', type: 'json', nullable: true })
  eligibleCustomerIds!: string[] | null;

  @Column({ name: 'eligible_group', type: 'varchar', length: 64, nullable: true })
  eligibleGroup!: string | null;

  @Column({ ...BOOLEAN_COLUMN, default: 0 })
  combinable!: boolean;

  @Column({ name: 'auto_apply', ...BOOLEAN_COLUMN, default: 0 })
  autoApply!: boolean;

  @Column({ name: 'starts_at', ...DATETIME3, nullable: true })
  startsAt!: Date | null;

  @Column({ name: 'ends_at', ...DATETIME3, nullable: true })
  endsAt!: Date | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: CouponStatus;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  // `@DeleteDateColumn`, not a plain `@Column` — `repository.softRemove()`
  // (used by `CouponService.remove()`) throws `MissingDeleteDateColumnError`
  // without it. Found live: every coupon DELETE 500'd, the same bug ProductEntity
  // had before it was fixed earlier this session.
  @DeleteDateColumn({ name: 'deleted_at', ...DATETIME3 })
  deletedAt!: Date | null;

  get isWithinWindow(): boolean {
    const now = Date.now();
    if (this.startsAt && this.startsAt.getTime() > now) return false;
    if (this.endsAt && this.endsAt.getTime() < now) return false;
    return true;
  }

  get isExhausted(): boolean {
    return this.usageLimitTotal !== null && this.usageCount >= this.usageLimitTotal;
  }
}

/**
 * One redemption per order (`uq_coupon_redemptions_order`) — the per-order
 * guard. The per-customer limit is enforced by counting these rows inside the
 * same transaction that reserves the coupon, not by a column here.
 */
@Entity('coupon_redemptions')
@TenantScoped()
export class CouponRedemptionEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'coupon_id', type: 'bigint', unsigned: true })
  couponId!: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId!: string;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true, nullable: true })
  customerId!: string | null;

  @Column({ name: 'discount_minor', type: 'bigint' })
  discountMinor!: string;

  @Column({ name: 'redeemed_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  redeemedAt!: Date;
}
