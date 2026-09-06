import { Column, Entity, VersionColumn } from 'typeorm';
import { BaseEntity, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const PAYMENT_GATEWAYS = [
  'RAZORPAY',
  'STRIPE',
  'PAYPAL',
  'CASHFREE',
  'PHONEPE',
  'PAYU',
  'COD',
  'BANK',
  'WALLET',
  // Not part of docs/02 §11's list — the same dev/test adapter `GatewayName`
  // already carries for subscription billing, allowed here for parity.
  'STUB',
] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

export const PAYMENT_METHODS = ['CARD', 'UPI', 'NETBANKING', 'WALLET', 'EMI', 'COD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_PAYMENT_ROW_STATUSES = [
  'INITIATED',
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
] as const;
export type OrderPaymentRowStatus = (typeof ORDER_PAYMENT_ROW_STATUSES)[number];

/**
 * One gateway transaction against one order (or, for COD, the collection promise
 * itself). Distinct from `SubscriptionPaymentEntity` — that table settles
 * platform billing invoices, this one settles shopper checkouts — but both speak
 * through the same `PaymentGatewayPort` (docs/01 §9).
 *
 * `idempotencyKey` is unique per tenant: a retried checkout replays onto the
 * same row instead of opening a second gateway order, which is what makes a
 * double-clicked Pay button impossible to double-charge.
 */
@Entity('payments')
@TenantScoped()
export class PaymentEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true, nullable: true })
  orderId!: string | null;

  @Column({ name: 'subscription_invoice_id', type: 'bigint', unsigned: true, nullable: true })
  subscriptionInvoiceId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  gateway!: PaymentGateway;

  @Column({ type: 'varchar', length: 32, nullable: true })
  method!: PaymentMethod | null;

  @Column({ type: 'varchar', length: 32, default: 'INITIATED' })
  status!: OrderPaymentRowStatus;

  @Column({ name: 'amount_minor', type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'amount_captured_minor', type: 'bigint', default: 0 })
  amountCapturedMinor!: string;

  @Column({ name: 'amount_refunded_minor', type: 'bigint', default: 0 })
  amountRefundedMinor!: string;

  @Column({ name: 'gateway_fee_minor', type: 'bigint', nullable: true })
  gatewayFeeMinor!: string | null;

  @Column({ name: 'gateway_tax_minor', type: 'bigint', nullable: true })
  gatewayTaxMinor!: string | null;

  @Column({ name: 'net_settlement_minor', type: 'bigint', nullable: true })
  netSettlementMinor!: string | null;

  @Column({ name: 'gateway_payment_id', type: 'varchar', length: 191, nullable: true })
  gatewayPaymentId!: string | null;

  @Column({ name: 'gateway_order_id', type: 'varchar', length: 191, nullable: true })
  gatewayOrderId!: string | null;

  @Column({ name: 'gateway_signature', type: 'varchar', length: 500, nullable: true })
  gatewaySignature!: string | null;

  @Column({ name: 'card_last4', type: 'char', length: 4, nullable: true })
  cardLast4!: string | null;

  @Column({ name: 'card_brand', type: 'varchar', length: 32, nullable: true })
  cardBrand!: string | null;

  @Column({ name: 'card_network', type: 'varchar', length: 32, nullable: true })
  cardNetwork!: string | null;

  @Column({ name: 'upi_vpa', type: 'varchar', length: 191, nullable: true })
  upiVpa!: string | null;

  @Column({ name: 'bank_name', type: 'varchar', length: 120, nullable: true })
  bankName!: string | null;

  @Column({ name: 'idempotency_key', type: 'char', length: 64 })
  idempotencyKey!: string;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 500, nullable: true })
  errorMessage!: string | null;

  /** Redacted before persisting — no PAN, no CVV, ever (docs/01 §8.4). */
  @Column({ name: 'gateway_response', type: 'json', nullable: true })
  gatewayResponse!: Record<string, unknown> | null;

  @Column({ name: 'authorized_at', ...DATETIME3, nullable: true })
  authorizedAt!: Date | null;

  @Column({ name: 'captured_at', ...DATETIME3, nullable: true })
  capturedAt!: Date | null;

  @Column({ name: 'failed_at', ...DATETIME3, nullable: true })
  failedAt!: Date | null;

  @Column({ name: 'reconciled_at', ...DATETIME3, nullable: true })
  reconciledAt!: Date | null;

  @Column({ name: 'correlation_id', type: 'char', length: 26, nullable: true })
  correlationId!: string | null;

  @VersionColumn({ name: 'version', type: 'int', unsigned: true, default: 0 })
  version!: number;

  get isSettled(): boolean {
    return this.status === 'CAPTURED' || this.status === 'PARTIALLY_REFUNDED' || this.status === 'REFUNDED';
  }
}

export const REFUND_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

@Entity('refunds')
@TenantScoped()
export class RefundEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'payment_id', type: 'bigint', unsigned: true })
  paymentId!: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true, nullable: true })
  orderId!: string | null;

  @Column({ name: 'return_id', type: 'bigint', unsigned: true, nullable: true })
  returnId!: string | null;

  @Column({ name: 'amount_minor', type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: RefundStatus;

  @Column({ name: 'gateway_refund_id', type: 'varchar', length: 191, nullable: true })
  gatewayRefundId!: string | null;

  @Column({ name: 'idempotency_key', type: 'char', length: 64 })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  speed!: 'NORMAL' | 'INSTANT' | null;

  @Column({ name: 'requested_by', type: 'bigint', unsigned: true, nullable: true })
  requestedBy!: string | null;

  @Column({ name: 'approved_by', type: 'bigint', unsigned: true, nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'gateway_response', type: 'json', nullable: true })
  gatewayResponse!: Record<string, unknown> | null;

  @Column({ name: 'processed_at', ...DATETIME3, nullable: true })
  processedAt!: Date | null;
}
