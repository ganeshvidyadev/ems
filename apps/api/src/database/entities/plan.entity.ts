import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BOOLEAN_COLUMN, DATETIME3 } from './base.entity';

/**
 * Quota keys.
 *
 * A closed union rather than free-form strings, so `@PlanQuota('max_prodcuts')` is a
 * compile error instead of a guard that silently never fires — a typo here would mean a
 * limit that is never enforced, discovered only when a merchant exceeds it by 100×.
 */
export const PLAN_LIMIT_KEYS = [
  'max_products',
  'max_orders_per_month',
  'max_staff_users',
  'max_storage_mb',
  'max_stores',
  'max_warehouses',
  'max_channels',
  'max_custom_domains',
] as const;
export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];

/** -1 means unlimited; 0 means the feature is unavailable on this plan. */
export const UNLIMITED = -1;

@Entity('plan_limits')
export class PlanLimitEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ name: 'plan_id', type: 'int', unsigned: true })
  planId!: number;

  @Column({ name: 'limit_key', type: 'varchar', length: 64 })
  limitKey!: PlanLimitKey;

  @Column({ name: 'limit_value', type: 'bigint' })
  limitValue!: string;
}

/**
 * A subscription plan. Platform-global: plans are the product catalogue of the SaaS
 * itself, shared by every tenant.
 */
@Entity('plans')
export class PlanEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Index('uq_plans_code', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Minor units. Never a float — see the Money value object in @ems/kernel. */
  @Column({ name: 'price_monthly_minor', type: 'bigint' })
  priceMonthlyMinor!: string;

  @Column({ name: 'price_yearly_minor', type: 'bigint' })
  priceYearlyMinor!: string;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency!: string;

  @Column({ name: 'trial_days', type: 'smallint', unsigned: true, default: 14 })
  trialDays!: number;

  /** False for negotiated plans: hidden from pricing, assignable by a platform admin. */
  @Column({ name: 'is_public', ...BOOLEAN_COLUMN, default: 1 })
  isPublic!: boolean;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder!: number;

  /**
   * Marketing bullets for the pricing page.
   *
   * **Never** consulted for gating — that is `plan_limits`. Keeping the two apart means
   * editing marketing copy cannot accidentally grant or revoke capability.
   */
  @Column({ type: 'json', nullable: true })
  features!: string[] | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: 'ACTIVE' | 'ARCHIVED';

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;

  @OneToMany(() => PlanLimitEntity, (limit) => limit.planId)
  limits?: PlanLimitEntity[];

  priceFor(cycle: 'MONTHLY' | 'YEARLY'): string {
    return cycle === 'YEARLY' ? this.priceYearlyMinor : this.priceMonthlyMinor;
  }

  get isFree(): boolean {
    return this.priceMonthlyMinor === '0' && this.priceYearlyMinor === '0';
  }
}
