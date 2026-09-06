import { Column, Entity } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const CUSTOMER_STATUSES = ['ACTIVE', 'BLOCKED', 'DEACTIVATED'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

/**
 * A shopper of one store. Deliberately separate from `UserEntity` — a customer
 * is not staff, is scoped to a single store within the tenant (not the whole
 * tenant), and the same email on two stores is two different customers.
 */
@Entity('customers')
@TenantScoped()
export class CustomerEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'email_normalized', type: 'varchar', length: 255, nullable: true })
  emailNormalized!: string | null;

  @Column({ name: 'phone_e164', type: 'varchar', length: 20, nullable: true })
  phoneE164!: string | null;

  /** NULL ⇒ guest checkout or OTP-only identity — there is no password to check. */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: CustomerStatus;

  @Column({ name: 'is_guest', ...BOOLEAN_COLUMN, default: 0 })
  isGuest!: boolean;

  @Column({ name: 'email_verified_at', ...DATETIME3, nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'phone_verified_at', ...DATETIME3, nullable: true })
  phoneVerifiedAt!: Date | null;

  @Column({ name: 'accepts_marketing', ...BOOLEAN_COLUMN, default: 0 })
  acceptsMarketing!: boolean;

  @Column({ name: 'marketing_consent_at', ...DATETIME3, nullable: true })
  marketingConsentAt!: Date | null;

  @Column({ name: 'default_address_id', type: 'bigint', unsigned: true, nullable: true })
  defaultAddressId!: string | null;

  @Column({ name: 'customer_group', type: 'varchar', length: 64, nullable: true })
  customerGroup!: string | null;

  @Column({ name: 'tax_exempt', ...BOOLEAN_COLUMN, default: 0 })
  taxExempt!: boolean;

  @Column({ name: 'tax_registration', type: 'varchar', length: 64, nullable: true })
  taxRegistration!: string | null;

  /** Cache of `SUM(points_delta)` from `loyalty_transactions` — never written directly. */
  @Column({ name: 'loyalty_points', type: 'int', default: 0 })
  loyaltyPoints!: number;

  @Column({ name: 'total_orders', type: 'int', unsigned: true, default: 0 })
  totalOrders!: number;

  @Column({ name: 'total_spent_minor', type: 'bigint', default: 0 })
  totalSpentMinor!: string;

  @Column({ name: 'average_order_minor', type: 'bigint', default: 0 })
  averageOrderMinor!: string;

  @Column({ name: 'first_order_at', ...DATETIME3, nullable: true })
  firstOrderAt!: Date | null;

  @Column({ name: 'last_order_at', ...DATETIME3, nullable: true })
  lastOrderAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'json', nullable: true })
  tags!: string[] | null;

  @Column({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;

  get displayName(): string {
    return [this.firstName, this.lastName].filter(Boolean).join(' ') || (this.email ?? 'Guest');
  }
}

export const ADDRESS_TYPES = ['SHIPPING', 'BILLING', 'BOTH'] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

@Entity('customer_addresses')
@TenantScoped()
export class CustomerAddressEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
  customerId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  label!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'BOTH' })
  type!: AddressType;

  @Column({ name: 'recipient_name', type: 'varchar', length: 200 })
  recipientName!: string;

  @Column({ name: 'phone_e164', type: 'varchar', length: 20, nullable: true })
  phoneE164!: string | null;

  @Column({ name: 'address_line1', type: 'varchar', length: 255 })
  addressLine1!: string;

  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  landmark!: string | null;

  @Column({ type: 'varchar', length: 120 })
  city!: string;

  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode!: string | null;

  @Column({ name: 'state_name', type: 'varchar', length: 120, nullable: true })
  stateName!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20 })
  postalCode!: string;

  @Column({ name: 'country_code', type: 'char', length: 2, default: 'IN' })
  countryCode!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  @Column({ name: 'is_default_shipping', ...BOOLEAN_COLUMN, default: 0 })
  isDefaultShipping!: boolean;

  @Column({ name: 'is_default_billing', ...BOOLEAN_COLUMN, default: 0 })
  isDefaultBilling!: boolean;

  @Column({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;
}

@Entity('wishlist_items')
@TenantScoped()
export class WishlistItemEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
  customerId!: string;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId!: string;

  @Column({ name: 'variant_id', type: 'bigint', unsigned: true, nullable: true })
  variantId!: string | null;

  @Column({ name: 'added_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  addedAt!: Date;
}
