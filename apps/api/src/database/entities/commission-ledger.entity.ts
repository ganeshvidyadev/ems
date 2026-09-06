import { BeforeInsert, Column, Entity, Index } from 'typeorm';
import { newPublicId } from '@ems/kernel';
import { NumericIdEntity } from './base.entity';

export const LEDGER_ENTRY_TYPES = ['SALE', 'COMMISSION', 'PLATFORM_FEE', 'REFUND_REVERSAL', 'ADJUSTMENT'] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export const LEDGER_BENEFICIARY_TYPES = ['SUPPLIER', 'RESELLER', 'PLATFORM'] as const;
export type LedgerBeneficiaryType = (typeof LEDGER_BENEFICIARY_TYPES)[number];

/**
 * Append-only, double-entry commission ledger (docs/02 §16).
 *
 * Never updated after insert — a correction is a new row with
 * `reverses_entry_id` pointing back, never a mutation. Platform-global for
 * the same reason `ProductShareEntity` is: `supplierTenantId` and
 * `resellerTenantId` are both real tenants and neither is a single
 * "owner" column the guard subscriber's model fits, so authorization for
 * reads/writes is explicit in `CommissionLedgerService`, keyed off
 * `beneficiaryTenantId` (the one column that answers "whose earnings is
 * this" for every row, `PLATFORM` rows included — those carry `NULL`).
 */
@Entity('commission_ledger')
export class CommissionLedgerEntity extends NumericIdEntity {
  @Column({ name: 'public_id', type: 'char', length: 26 })
  publicId!: string;

  @Index('idx_commission_ledger_order')
  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId!: string;

  @Column({ name: 'order_item_id', type: 'bigint', unsigned: true, nullable: true })
  orderItemId!: string | null;

  @Column({ name: 'supplier_tenant_id', type: 'bigint', unsigned: true })
  supplierTenantId!: string;

  @Column({ name: 'reseller_tenant_id', type: 'bigint', unsigned: true, nullable: true })
  resellerTenantId!: string | null;

  @Column({ name: 'entry_type', type: 'varchar', length: 32 })
  entryType!: LedgerEntryType;

  @Column({ type: 'varchar', length: 8 })
  direction!: LedgerDirection;

  @Column({ name: 'beneficiary_type', type: 'varchar', length: 32 })
  beneficiaryType!: LedgerBeneficiaryType;

  /** NULL only for `beneficiaryType = 'PLATFORM'` — the platform is not itself a tenant. */
  @Index('idx_commission_ledger_beneficiary')
  @Column({ name: 'beneficiary_tenant_id', type: 'bigint', unsigned: true, nullable: true })
  beneficiaryTenantId!: string | null;

  @Column({ name: 'gross_minor', type: 'bigint' })
  grossMinor!: string;

  @Column({ name: 'commission_minor', type: 'bigint', default: 0 })
  commissionMinor!: string;

  @Column({ name: 'platform_fee_minor', type: 'bigint', default: 0 })
  platformFeeMinor!: string;

  @Column({ name: 'tax_minor', type: 'bigint', default: 0 })
  taxMinor!: string;

  @Column({ name: 'net_minor', type: 'bigint' })
  netMinor!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  /** NULL means unsettled — this is exactly what `SettlementService` batches on. */
  @Index('idx_commission_ledger_unsettled')
  @Column({ name: 'settlement_id', type: 'bigint', unsigned: true, nullable: true })
  settlementId!: string | null;

  @Column({ name: 'reverses_entry_id', type: 'bigint', unsigned: true, nullable: true })
  reversesEntryId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ name: 'correlation_id', type: 'char', length: 26, nullable: true })
  correlationId!: string | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @BeforeInsert()
  protected assignPublicId(): void {
    if (!this.publicId) this.publicId = newPublicId();
  }
}
