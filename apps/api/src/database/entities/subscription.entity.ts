import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3 } from './base.entity';
import { PlanEntity } from './plan.entity';
import { TenantEntity } from './tenant.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'PAUSED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type BillingCycle = 'MONTHLY' | 'YEARLY';

/** Statuses that count as "live" — mirrors the `active_guard` generated column. */
export const LIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
];

@Entity('subscriptions')
@TenantScoped()
export class SubscriptionEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'plan_id', type: 'int', unsigned: true })
  planId!: number;

  @Column({ name: 'billing_cycle', type: 'varchar', length: 16 })
  billingCycle!: BillingCycle;

  @Column({ type: 'varchar', length: 32 })
  status!: SubscriptionStatus;

  /**
   * Price snapshot taken at signup.
   *
   * A later plan price change must not retro-alter what an existing subscriber pays.
   * Reading the price from `plans` at renewal time would silently re-price every
   * subscriber the moment marketing edits a number.
   */
  @Column({ name: 'unit_amount_minor', type: 'bigint' })
  unitAmountMinor!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'int', unsigned: true, default: 1 })
  quantity!: number;

  @Column({ name: 'trial_start', ...DATETIME3, nullable: true })
  trialStart!: Date | null;

  @Column({ name: 'trial_end', ...DATETIME3, nullable: true })
  trialEnd!: Date | null;

  @Column({ name: 'current_period_start', ...DATETIME3 })
  currentPeriodStart!: Date;

  @Index('idx_subscriptions_renewal')
  @Column({ name: 'current_period_end', ...DATETIME3 })
  currentPeriodEnd!: Date;

  /** Cancel at the end of the paid period rather than immediately — they paid for it. */
  @Column({ name: 'cancel_at_period_end', ...BOOLEAN_COLUMN, default: 0 })
  cancelAtPeriodEnd!: boolean;

  @Column({ name: 'cancelled_at', ...DATETIME3, nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'ended_at', ...DATETIME3, nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'auto_renew', ...BOOLEAN_COLUMN, default: 1 })
  autoRenew!: boolean;

  @Column({ type: 'varchar', length: 32, nullable: true })
  gateway!: string | null;

  @Column({ name: 'gateway_subscription_id', type: 'varchar', length: 191, nullable: true })
  gatewaySubscriptionId!: string | null;

  @Column({ name: 'gateway_customer_id', type: 'varchar', length: 191, nullable: true })
  gatewayCustomerId!: string | null;

  @Column({ name: 'payment_method_id', type: 'bigint', unsigned: true, nullable: true })
  paymentMethodId!: string | null;

  /** Failed collection attempts. Drives the dunning schedule and eventual suspension. */
  @Column({ name: 'dunning_attempts', type: 'tinyint', unsigned: true, default: 0 })
  dunningAttempts!: number;

  /**
   * How long a PAST_DUE tenant keeps read access before suspension.
   *
   * Cutting a paying customer off the instant a card retry fails loses them revenue and
   * loses us the account; a grace window with read-only access is the pressure that
   * actually gets cards updated.
   */
  @Column({ name: 'grace_period_ends_at', ...DATETIME3, nullable: true })
  gracePeriodEndsAt!: Date | null;

  @Column({ name: 'version', type: 'int', unsigned: true, default: 0 })
  version!: number;

  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  @ManyToOne(() => PlanEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan?: PlanEntity;

  // -------------------------------------------------------------------------
  // Behaviour
  // -------------------------------------------------------------------------

  get isLive(): boolean {
    return LIVE_SUBSCRIPTION_STATUSES.includes(this.status);
  }

  get isInTrial(): boolean {
    return (
      this.status === 'TRIALING' &&
      this.trialEnd !== null &&
      this.trialEnd.getTime() > Date.now()
    );
  }

  /** Writes are permitted; PAST_DUE deliberately is not (read-only, docs/01 §8.3). */
  get canWrite(): boolean {
    return this.status === 'ACTIVE' || this.status === 'TRIALING';
  }

  get isPastGracePeriod(): boolean {
    return (
      this.status === 'PAST_DUE' &&
      this.gracePeriodEndsAt !== null &&
      this.gracePeriodEndsAt.getTime() <= Date.now()
    );
  }

  /**
   * Unused fraction of the current period, as a 0–1 ratio scaled to basis points.
   *
   * Integer basis points rather than a float: proration feeds a money calculation, and a
   * float ratio reintroduces exactly the rounding drift `Money` exists to prevent.
   */
  remainingBasisPoints(now = new Date()): number {
    const total = this.currentPeriodEnd.getTime() - this.currentPeriodStart.getTime();
    if (total <= 0) return 0;

    const remaining = this.currentPeriodEnd.getTime() - now.getTime();
    if (remaining <= 0) return 0;
    if (remaining >= total) return 10_000;

    return Math.round((remaining / total) * 10_000);
  }
}
