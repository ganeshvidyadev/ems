import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const SETTLEMENT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'PROCESSING',
  'PAID',
  'FAILED',
  'ON_HOLD',
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

/**
 * A payout batch for one beneficiary tenant over one period.
 *
 * Unlike `ProductShareEntity`/`CommissionLedgerEntity`, every row here
 * genuinely belongs to exactly one tenant — `beneficiary_tenant_id` — so
 * this one *can* be `@TenantScoped()`, just on that column instead of the
 * default `tenant_id`. The settlement-run job creates these from a
 * tenant-less system context (see `TenantGuardSubscriber.beforeInsert`'s
 * "explicitly set, no context to disagree with" path), while a supplier or
 * reseller's own read is scoped exactly like any other tenant-owned table.
 */
@Entity('settlements')
@TenantScoped({ column: 'beneficiaryTenantId' })
export class SettlementEntity extends BaseEntity {
  @Index('idx_settlements_beneficiary')
  @Column({ name: 'beneficiary_tenant_id', type: 'bigint', unsigned: true })
  beneficiaryTenantId!: string;

  @Index('uq_settlements_number', { unique: true })
  @Column({ name: 'settlement_number', type: 'varchar', length: 64 })
  settlementNumber!: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: SettlementStatus;

  @Column({ name: 'gross_minor', type: 'bigint', default: 0 })
  grossMinor!: string;

  @Column({ name: 'commission_minor', type: 'bigint', default: 0 })
  commissionMinor!: string;

  @Column({ name: 'platform_fee_minor', type: 'bigint', default: 0 })
  platformFeeMinor!: string;

  @Column({ name: 'tax_minor', type: 'bigint', default: 0 })
  taxMinor!: string;

  @Column({ name: 'adjustment_minor', type: 'bigint', default: 0 })
  adjustmentMinor!: string;

  @Column({ name: 'net_payable_minor', type: 'bigint', default: 0 })
  netPayableMinor!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'entry_count', type: 'int', unsigned: true, default: 0 })
  entryCount!: number;

  @Column({ name: 'payout_method', type: 'varchar', length: 32, nullable: true })
  payoutMethod!: 'BANK_TRANSFER' | 'GATEWAY_PAYOUT' | null;

  @Column({ name: 'payout_reference', type: 'varchar', length: 191, nullable: true })
  payoutReference!: string | null;

  @Column({ name: 'paid_at', type: 'datetime', precision: 3, nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'report_url', type: 'varchar', length: 500, nullable: true })
  reportUrl!: string | null;

  @Column({ name: 'approved_by', type: 'bigint', unsigned: true, nullable: true })
  approvedBy!: string | null;

  get isPaid(): boolean {
    return this.status === 'PAID';
  }
}
