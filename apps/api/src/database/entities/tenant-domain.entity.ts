import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { NumericIdEntity, DATETIME3, BOOLEAN_COLUMN } from './base.entity';
import { TenantEntity } from './tenant.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const DOMAIN_TYPES = ['SUBDOMAIN', 'CUSTOM'] as const;
export type DomainType = (typeof DOMAIN_TYPES)[number];

export const SSL_STATUSES = ['NONE', 'PENDING', 'ISSUING', 'ACTIVE', 'FAILED', 'EXPIRED'] as const;
export type SslStatus = (typeof SSL_STATUSES)[number];

/**
 * Host → tenant routing table. Read on every storefront request, so it sits
 * behind a Redis cache (`domain:{host}`); this table is the source of truth
 * behind that cache.
 */
@Entity('tenant_domains')
@TenantScoped()
export class TenantDomainEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true, nullable: true })
  storeId!: string | null;

  /**
   * Globally unique — the one deliberate exception to "unique per tenant".
   * A hostname is the platform's routing key, so it cannot be per-tenant:
   * two tenants claiming `shop.com` would make routing ambiguous.
   */
  @Index('uq_tenant_domains_hostname', { unique: true })
  @Column({ type: 'varchar', length: 253 })
  hostname!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: DomainType;

  @Column({ name: 'is_primary', ...BOOLEAN_COLUMN, default: 0 })
  isPrimary!: boolean;

  @Column({ name: 'verification_token', type: 'varchar', length: 64, nullable: true })
  verificationToken!: string | null;

  @Column({ name: 'verification_method', type: 'varchar', length: 32, nullable: true })
  verificationMethod!: string | null;

  @Column({ name: 'verified_at', ...DATETIME3, nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: 'ssl_status', type: 'varchar', length: 32, default: 'NONE' })
  sslStatus!: SslStatus;

  @Column({ name: 'ssl_issued_at', ...DATETIME3, nullable: true })
  sslIssuedAt!: Date | null;

  @Column({ name: 'ssl_expires_at', ...DATETIME3, nullable: true })
  sslExpiresAt!: Date | null;

  @Column({ name: 'last_check_at', ...DATETIME3, nullable: true })
  lastCheckAt!: Date | null;

  /** Drives exponential backoff on DNS verification (up to 72h — docs/01 §10). */
  @Column({ name: 'check_attempts', type: 'int', unsigned: true, default: 0 })
  checkAttempts!: number;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.domains, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  get isVerified(): boolean {
    return this.verifiedAt !== null;
  }

  /** Ready to serve HTTPS traffic. */
  get isLive(): boolean {
    return this.isVerified && this.sslStatus === 'ACTIVE';
  }
}
