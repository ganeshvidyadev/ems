import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity, DATETIME3 } from './base.entity';
import type { TenantDomainEntity } from './tenant-domain.entity';

export const TENANT_STATUSES = [
  'PENDING',
  'PROVISIONING',
  'ACTIVE',
  'TRIAL',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
  'DELETED',
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/**
 * The tenant registry. Platform-global by definition — it is the table every
 * other tenant-scoped table points at, so it carries no `tenant_id` of its own
 * and is listed in `PLATFORM_GLOBAL_ENTITIES`.
 */
@Entity('tenants')
export class TenantEntity extends BaseEntity {
  /** DNS label used for the free subdomain. Globally unique. */
  @Index('uq_tenants_slug', { unique: true })
  @Column({ type: 'varchar', length: 63 })
  slug!: string;

  @Column({ name: 'business_name', type: 'varchar', length: 255 })
  businessName!: string;

  @Column({ name: 'legal_name', type: 'varchar', length: 255, nullable: true })
  legalName!: string | null;

  /**
   * Nullable and set after the first user is created. The owner is a `users` row
   * whose `tenant_id` points back here, so one of the two references has to be
   * deferred — this is the chicken/egg break.
   */
  @Column({ name: 'owner_user_id', type: 'bigint', unsigned: true, nullable: true })
  ownerUserId!: string | null;

  /**
   * Denormalised pointer to the live subscription.
   *
   * `subscriptions.uq_subscriptions_one_active` already guarantees at most one live row
   * per tenant, so this is a cache of that fact — it saves a join on the request path
   * where guards need the plan on every write.
   */
  @Column({ name: 'current_subscription_id', type: 'bigint', unsigned: true, nullable: true })
  currentSubscriptionId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: TenantStatus;

  /** Resumable saga cursor — see the provisioning flow in docs/01 §10. */
  @Column({ name: 'provisioning_step', type: 'varchar', length: 64, nullable: true })
  provisioningStep!: string | null;

  @Column({ name: 'country_code', type: 'char', length: 2, default: 'IN' })
  countryCode!: string;

  @Column({ name: 'default_currency', type: 'char', length: 3, default: 'INR' })
  defaultCurrency!: string;

  @Column({ name: 'default_locale', type: 'varchar', length: 10, default: 'en-IN' })
  defaultLocale!: string;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Kolkata' })
  timezone!: string;

  /** GSTIN / VAT number. */
  @Column({ name: 'tax_registration', type: 'varchar', length: 64, nullable: true })
  taxRegistration!: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 255 })
  contactEmail!: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 32, nullable: true })
  contactPhone!: string | null;

  @Column({ name: 'trial_ends_at', ...DATETIME3, nullable: true })
  trialEndsAt!: Date | null;

  @Column({ name: 'suspended_at', ...DATETIME3, nullable: true })
  suspendedAt!: Date | null;

  @Column({ name: 'suspension_reason', type: 'varchar', length: 255, nullable: true })
  suspensionReason!: string | null;

  /** Free-form wizard progress. Open-ended, never filtered on — so JSON is right. */
  @Column({ name: 'onboarding_state', type: 'json', nullable: true })
  onboardingState!: Record<string, unknown> | null;

  @Column({ name: 'version', type: 'int', unsigned: true, default: 0 })
  version!: number;

  @Column({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;

  @OneToMany('TenantDomainEntity', 'tenant')
  domains?: TenantDomainEntity[];

  // -------------------------------------------------------------------------
  // Behaviour
  // -------------------------------------------------------------------------

  /** Can this tenant's storefront serve traffic? */
  get isServiceable(): boolean {
    return this.status === 'ACTIVE' || this.status === 'TRIAL' || this.status === 'PAST_DUE';
  }

  /**
   * Can merchant users write?
   *
   * `PAST_DUE` is deliberately readable but not writable: cutting off a paying
   * customer's storefront over a failed card retry loses them revenue and us the
   * account, while blocking writes is a strong enough prompt to pay.
   */
  get canWrite(): boolean {
    return this.status === 'ACTIVE' || this.status === 'TRIAL';
  }
}
