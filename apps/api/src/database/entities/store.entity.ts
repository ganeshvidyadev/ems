import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantEntity } from './tenant.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const STORE_STATUSES = ['DRAFT', 'ACTIVE', 'MAINTENANCE', 'CLOSED'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

@Entity('stores')
@TenantScoped()
export class StoreEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** Unique per tenant — two tenants may both have a store called "outlet". */
  @Column({ type: 'varchar', length: 120 })
  slug!: string;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: StoreStatus;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency!: string;

  @Column({ type: 'varchar', length: 10, default: 'en-IN' })
  locale!: string;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Kolkata' })
  timezone!: string;

  @Column({ name: 'weight_unit', type: 'varchar', length: 8, default: 'kg' })
  weightUnit!: string;

  @Column({ name: 'dimension_unit', type: 'varchar', length: 8, default: 'cm' })
  dimensionUnit!: string;

  @Column({ name: 'active_theme_id', type: 'bigint', unsigned: true, nullable: true })
  activeThemeId!: string | null;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'favicon_url', type: 'varchar', length: 500, nullable: true })
  faviconUrl!: string | null;

  @Column({ name: 'support_email', type: 'varchar', length: 255, nullable: true })
  supportEmail!: string | null;

  @Column({ name: 'support_phone', type: 'varchar', length: 32, nullable: true })
  supportPhone!: string | null;

  @Column({ name: 'business_address', type: 'json', nullable: true })
  businessAddress!: Record<string, unknown> | null;

  /** Marketplace roles (Phase 9). A store can be both — reselling and supplying. */
  @Column({ name: 'is_marketplace_supplier', ...BOOLEAN_COLUMN, default: 0 })
  isMarketplaceSupplier!: boolean;

  @Column({ name: 'is_marketplace_reseller', ...BOOLEAN_COLUMN, default: 0 })
  isMarketplaceReseller!: boolean;

  @Column({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  /** Serving shoppers. MAINTENANCE renders a holding page rather than 404ing the domain. */
  get isServing(): boolean {
    return this.status === 'ACTIVE';
  }
}

/**
 * Key/value store settings.
 *
 * Not a wide table: a new setting would otherwise need a migration, and this schema will
 * accumulate hundreds across checkout, tax, SEO, notifications, payments and shipping.
 * `setting_group` lets one console screen load in a single query.
 */
@Entity('store_settings')
@TenantScoped()
export class StoreSettingEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Column({ name: 'setting_group', type: 'varchar', length: 64 })
  settingGroup!: string;

  @Column({ name: 'setting_key', type: 'varchar', length: 120 })
  settingKey!: string;

  @Column({ name: 'setting_value', type: 'json', nullable: true })
  settingValue!: unknown;

  /**
   * Marks a value stored as AES-256-GCM ciphertext.
   *
   * Payment gateway secrets live here. A flag rather than a separate table so the reader
   * knows to decrypt without needing to hardcode which keys are sensitive.
   */
  @Column({ name: 'is_encrypted', ...BOOLEAN_COLUMN, default: 0 })
  isEncrypted!: boolean;

  @Column({ name: 'updated_by', type: 'bigint', unsigned: true, nullable: true })
  updatedBy!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;
}

export const WAREHOUSE_TYPES = ['WAREHOUSE', 'STORE', 'DROPSHIP', 'VIRTUAL'] as const;
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number];

@Entity('warehouses')
@TenantScoped()
export class WarehouseEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  /** NULL means shared across every store of the tenant. */
  @Column({ name: 'store_id', type: 'bigint', unsigned: true, nullable: true })
  storeId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 32, default: 'WAREHOUSE' })
  type!: WarehouseType;

  @Column({ name: 'address_line1', type: 'varchar', length: 255, nullable: true })
  addressLine1!: string | null;

  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode!: string | null;

  @Column({ name: 'country_code', type: 'char', length: 2, default: 'IN' })
  countryCode!: string;

  /** DECIMAL, returned as a string — geo precision must survive the driver intact. */
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  /** Allocation order when several warehouses could fulfil the same order. */
  @Index('idx_warehouses_tenant_active')
  @Column({ type: 'smallint', default: 0 })
  priority!: number;

  @Column({ name: 'is_default', ...BOOLEAN_COLUMN, default: 0 })
  isDefault!: boolean;

  @Column({ name: 'is_active', ...BOOLEAN_COLUMN, default: 1 })
  isActive!: boolean;

  @Column({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;
}
