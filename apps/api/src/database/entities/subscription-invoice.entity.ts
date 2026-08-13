import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { BaseEntity, DATETIME3, NumericIdEntity } from './base.entity';
import { SubscriptionEntity } from './subscription.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const INVOICE_STATUSES = [
  'DRAFT',
  'OPEN',
  'PAID',
  'PARTIALLY_PAID',
  'UNCOLLECTIBLE',
  'VOID',
  'REFUNDED',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitAmountMinor: string;
  amountMinor: string;
  periodStart?: string;
  periodEnd?: string;
  /** Set on prorated credit lines, which are negative. */
  proration?: boolean;
}

@Entity('subscription_invoices')
@TenantScoped()
export class SubscriptionInvoiceEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'subscription_id', type: 'bigint', unsigned: true })
  subscriptionId!: string;

  /**
   * Gapless per tenant.
   *
   * Allocated from `invoice_sequences` under a row lock, not from AUTO_INCREMENT —
   * AUTO_INCREMENT consumes a value on a rolled-back transaction, and a gap in a tax
   * invoice series is a compliance problem in most jurisdictions.
   */
  @Column({ name: 'invoice_number', type: 'varchar', length: 64 })
  invoiceNumber!: string;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: InvoiceStatus;

  @Column({ name: 'subtotal_minor', type: 'bigint', default: 0 })
  subtotalMinor!: string;

  @Column({ name: 'discount_minor', type: 'bigint', default: 0 })
  discountMinor!: string;

  @Column({ name: 'tax_minor', type: 'bigint', default: 0 })
  taxMinor!: string;

  @Column({ name: 'total_minor', type: 'bigint', default: 0 })
  totalMinor!: string;

  @Column({ name: 'amount_paid_minor', type: 'bigint', default: 0 })
  amountPaidMinor!: string;

  @Column({ name: 'amount_due_minor', type: 'bigint', default: 0 })
  amountDueMinor!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'period_start', ...DATETIME3 })
  periodStart!: Date;

  @Column({ name: 'period_end', ...DATETIME3 })
  periodEnd!: Date;

  @Column({ name: 'due_at', ...DATETIME3, nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'paid_at', ...DATETIME3, nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'voided_at', ...DATETIME3, nullable: true })
  voidedAt!: Date | null;

  /**
   * Immutable snapshot of exactly what was billed.
   *
   * Rendering an old invoice from *current* plan prices would silently rewrite history —
   * and an invoice that changes after it was issued is not an invoice.
   */
  @Column({ name: 'line_items', type: 'json' })
  lineItems!: InvoiceLineItem[];

  @Column({ name: 'billing_address', type: 'json', nullable: true })
  billingAddress!: Record<string, unknown> | null;

  @Column({ name: 'pdf_url', type: 'varchar', length: 500, nullable: true })
  pdfUrl!: string | null;

  @ManyToOne(() => SubscriptionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: SubscriptionEntity;

  get isSettled(): boolean {
    return this.status === 'PAID' || this.status === 'VOID';
  }

  get isOverdue(): boolean {
    return (
      (this.status === 'OPEN' || this.status === 'PARTIALLY_PAID') &&
      this.dueAt !== null &&
      this.dueAt.getTime() < Date.now()
    );
  }
}

/**
 * Per-tenant invoice number allocator.
 *
 * A counter row incremented under `SELECT … FOR UPDATE`. Deliberately not
 * AUTO_INCREMENT: MySQL consumes an auto-increment value even when the surrounding
 * transaction rolls back, which produces gaps — and "gapless" is the entire requirement.
 *
 * Serialising invoice creation per tenant is an acceptable cost: a tenant issues a
 * handful of subscription invoices a year, not thousands a second.
 */
@Entity('invoice_sequences')
@TenantScoped()
export class InvoiceSequenceEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @PrimaryColumn({ type: 'varchar', length: 32, default: 'SUB' })
  series!: string;

  /** Numbering restarts each fiscal year, which is the norm for tax invoices. */
  @PrimaryColumn({ name: 'fiscal_year', type: 'smallint', unsigned: true })
  fiscalYear!: number;

  @Column({ name: 'last_number', type: 'bigint', unsigned: true, default: 0 })
  lastNumber!: string;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;
}

export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

@Entity('subscription_payments')
@TenantScoped()
export class SubscriptionPaymentEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'subscription_id', type: 'bigint', unsigned: true, nullable: true })
  subscriptionId!: string | null;

  @Column({ name: 'invoice_id', type: 'bigint', unsigned: true, nullable: true })
  invoiceId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  gateway!: string;

  @Column({ name: 'gateway_order_id', type: 'varchar', length: 191, nullable: true })
  gatewayOrderId!: string | null;

  /** Unique per gateway, so a replayed webhook cannot record the same capture twice. */
  @Index('uq_sub_payments_gateway_payment')
  @Column({ name: 'gateway_payment_id', type: 'varchar', length: 191, nullable: true })
  gatewayPaymentId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: PaymentStatus;

  @Column({ name: 'amount_minor', type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  method!: string | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 64, nullable: true })
  failureCode!: string | null;

  @Column({ name: 'failure_message', type: 'varchar', length: 500, nullable: true })
  failureMessage!: string | null;

  /** Gateway response for dispute evidence. Card data is stripped by the adapter (SAQ-A). */
  @Column({ name: 'gateway_payload', type: 'json', nullable: true })
  gatewayPayload!: Record<string, unknown> | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: 'captured_at', ...DATETIME3, nullable: true })
  capturedAt!: Date | null;

  @Column({ name: 'failed_at', ...DATETIME3, nullable: true })
  failedAt!: Date | null;

  get isSuccessful(): boolean {
    return this.status === 'CAPTURED';
  }
}
