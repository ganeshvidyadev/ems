import { Column, Entity, PrimaryColumn, VersionColumn } from 'typeorm';
import { BaseEntity, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const ORDER_STATUSES = [
  'DRAFT',
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'RETURNED',
  'FAILED',
  'ON_HOLD',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'PARTIALLY_PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
  'VOIDED',
] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const ORDER_FULFILMENT_STATUSES = [
  'UNFULFILLED',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'RETURNED',
  'PARTIALLY_RETURNED',
] as const;
export type OrderFulfilmentStatus = (typeof ORDER_FULFILMENT_STATUSES)[number];

export const ORDER_CHANNELS = [
  'WEB',
  'POS',
  'AMAZON',
  'FLIPKART',
  'EBAY',
  'META',
  'WHATSAPP',
  'API',
] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export interface OrderAddressSnapshot {
  recipientName: string;
  phoneE164?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city: string;
  stateCode?: string | null;
  stateName?: string | null;
  postalCode: string;
  countryCode: string;
}

/**
 * The commerce aggregate root.
 *
 * Three independent status axes (`status`, `paymentStatus`, `fulfilmentStatus`)
 * on purpose — an order can be `PROCESSING` + `PAID` + `UNFULFILLED`
 * simultaneously, and collapsing that into one field loses information the
 * fulfilment and finance views both need. Every money and address field is a
 * snapshot: reprinting an old invoice must never reflect a later product
 * rename, reprice, or address edit.
 */
@Entity('orders')
@TenantScoped()
export class OrderEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  /** Merchant-facing, gapless per tenant — allocated like `invoice_number` (docs/02 §5). */
  @Column({ name: 'order_number', type: 'varchar', length: 64 })
  orderNumber!: string;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true, nullable: true })
  customerId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'phone_e164', type: 'varchar', length: 20, nullable: true })
  phoneE164!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: OrderStatus;

  @Column({ name: 'payment_status', type: 'varchar', length: 32, default: 'PENDING' })
  paymentStatus!: OrderPaymentStatus;

  @Column({ name: 'fulfilment_status', type: 'varchar', length: 32, default: 'UNFULFILLED' })
  fulfilmentStatus!: OrderFulfilmentStatus;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'subtotal_minor', type: 'bigint', default: 0 })
  subtotalMinor!: string;

  @Column({ name: 'discount_minor', type: 'bigint', default: 0 })
  discountMinor!: string;

  @Column({ name: 'shipping_minor', type: 'bigint', default: 0 })
  shippingMinor!: string;

  @Column({ name: 'tax_minor', type: 'bigint', default: 0 })
  taxMinor!: string;

  @Column({ name: 'cod_fee_minor', type: 'bigint', default: 0 })
  codFeeMinor!: string;

  @Column({ name: 'round_off_minor', type: 'bigint', default: 0 })
  roundOffMinor!: string;

  @Column({ name: 'total_minor', type: 'bigint', default: 0 })
  totalMinor!: string;

  @Column({ name: 'amount_paid_minor', type: 'bigint', default: 0 })
  amountPaidMinor!: string;

  @Column({ name: 'amount_refunded_minor', type: 'bigint', default: 0 })
  amountRefundedMinor!: string;

  @Column({ name: 'shipping_address', type: 'json', nullable: true })
  shippingAddress!: OrderAddressSnapshot | null;

  @Column({ name: 'billing_address', type: 'json', nullable: true })
  billingAddress!: OrderAddressSnapshot | null;

  @Column({ type: 'varchar', length: 32, default: 'WEB' })
  channel!: OrderChannel;

  @Column({ name: 'channel_order_ref', type: 'varchar', length: 191, nullable: true })
  channelOrderRef!: string | null;

  @Column({ name: 'is_marketplace_order', type: 'tinyint', width: 1, default: 0 })
  isMarketplaceOrder!: boolean;

  @Column({ name: 'reseller_tenant_id', type: 'bigint', unsigned: true, nullable: true })
  resellerTenantId!: string | null;

  @Column({ name: 'parent_order_id', type: 'bigint', unsigned: true, nullable: true })
  parentOrderId!: string | null;

  @Column({ name: 'coupon_id', type: 'bigint', unsigned: true, nullable: true })
  couponId!: string | null;

  @Column({ name: 'coupon_code', type: 'varchar', length: 64, nullable: true })
  couponCode!: string | null;

  @Column({ name: 'customer_note', type: 'text', nullable: true })
  customerNote!: string | null;

  @Column({ name: 'internal_note', type: 'text', nullable: true })
  internalNote!: string | null;

  @Column({ type: 'json', nullable: true })
  tags!: string[] | null;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 255, nullable: true })
  cancelReason!: string | null;

  @Column({ name: 'cancelled_at', ...DATETIME3, nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'placed_at', ...DATETIME3, nullable: true })
  placedAt!: Date | null;

  @Column({ name: 'confirmed_at', ...DATETIME3, nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'delivered_at', ...DATETIME3, nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'closed_at', ...DATETIME3, nullable: true })
  closedAt!: Date | null;

  @Column({ name: 'ip_address', type: 'varbinary', length: 16, nullable: true })
  ipAddress!: Buffer | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'json', nullable: true })
  utm!: Record<string, string> | null;

  @Column({ name: 'correlation_id', type: 'char', length: 26, nullable: true })
  correlationId!: string | null;

  @VersionColumn({ name: 'version', type: 'int', unsigned: true, default: 0 })
  version!: number;

  get isPaid(): boolean {
    return this.paymentStatus === 'PAID' || this.paymentStatus === 'PARTIALLY_REFUNDED';
  }

  get isCancellable(): boolean {
    return this.status === 'PENDING' || this.status === 'CONFIRMED' || this.status === 'ON_HOLD';
  }

  /** Mirrors the status check `fulfil()` already applies when deciding whether to advance to SHIPPED. */
  get isFulfillable(): boolean {
    return this.status === 'CONFIRMED' || this.status === 'PROCESSING';
  }
}

/** Immutable snapshot of what was actually sold — see `OrderEntity` doc comment. */
@Entity('order_items')
@TenantScoped()
export class OrderItemEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId!: string;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true, nullable: true })
  productId!: string | null;

  @Column({ name: 'variant_id', type: 'bigint', unsigned: true, nullable: true })
  variantId!: string | null;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ type: 'varchar', length: 500 })
  name!: string;

  @Column({ name: 'variant_title', type: 'varchar', length: 255, nullable: true })
  variantTitle!: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 1000, nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'hsn_code', type: 'varchar', length: 20, nullable: true })
  hsnCode!: string | null;

  @Column({ type: 'int', unsigned: true })
  quantity!: number;

  @Column({ name: 'unit_price_minor', type: 'bigint' })
  unitPriceMinor!: string;

  @Column({ name: 'unit_cost_minor', type: 'bigint', nullable: true })
  unitCostMinor!: string | null;

  @Column({ name: 'line_subtotal_minor', type: 'bigint' })
  lineSubtotalMinor!: string;

  @Column({ name: 'line_discount_minor', type: 'bigint', default: 0 })
  lineDiscountMinor!: string;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 7, scale: 4, default: 0 })
  taxRate!: string;

  @Column({ name: 'line_tax_minor', type: 'bigint', default: 0 })
  lineTaxMinor!: string;

  @Column({ name: 'line_total_minor', type: 'bigint' })
  lineTotalMinor!: string;

  @Column({ name: 'tax_breakup', type: 'json', nullable: true })
  taxBreakup!: { name: string; rate: string; amountMinor: string }[] | null;

  @Column({ name: 'quantity_fulfilled', type: 'int', unsigned: true, default: 0 })
  quantityFulfilled!: number;

  @Column({ name: 'quantity_returned', type: 'int', unsigned: true, default: 0 })
  quantityReturned!: number;

  @Column({ name: 'quantity_cancelled', type: 'int', unsigned: true, default: 0 })
  quantityCancelled!: number;

  @Column({ name: 'warehouse_id', type: 'bigint', unsigned: true, nullable: true })
  warehouseId!: string | null;

  @Column({ name: 'supplier_tenant_id', type: 'bigint', unsigned: true, nullable: true })
  supplierTenantId!: string | null;

  @Column({ name: 'commission_rate', type: 'decimal', precision: 7, scale: 4, nullable: true })
  commissionRate!: string | null;

  @Column({ name: 'commission_minor', type: 'bigint', nullable: true })
  commissionMinor!: string | null;

  @Column({ type: 'json', nullable: true })
  properties!: Record<string, unknown> | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;

  get quantityOpen(): number {
    return this.quantity - this.quantityFulfilled - this.quantityCancelled;
  }
}

export const ORDER_STATUS_HISTORY_TYPES = ['ORDER', 'PAYMENT', 'FULFILMENT'] as const;
export type OrderStatusHistoryType = (typeof ORDER_STATUS_HISTORY_TYPES)[number];

export const ORDER_STATUS_ACTOR_TYPES = ['USER', 'CUSTOMER', 'SYSTEM', 'WEBHOOK'] as const;
export type OrderStatusActorType = (typeof ORDER_STATUS_ACTOR_TYPES)[number];

/** The audit trail behind the order timeline shown to both merchant and shopper. */
@Entity('order_status_history')
@TenantScoped()
export class OrderStatusHistoryEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId!: string;

  @Column({ name: 'status_type', type: 'varchar', length: 32 })
  statusType!: OrderStatusHistoryType;

  @Column({ name: 'from_status', type: 'varchar', length: 32, nullable: true })
  fromStatus!: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 32 })
  toStatus!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 32 })
  actorType!: OrderStatusActorType;

  @Column({ name: 'actor_id', type: 'bigint', unsigned: true, nullable: true })
  actorId!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'correlation_id', type: 'char', length: 26, nullable: true })
  correlationId!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;
}

/**
 * Per-tenant order-number allocator — the same `SELECT ... FOR UPDATE` counter
 * pattern as `InvoiceSequenceEntity`, without the fiscal-year reset an order
 * number has no reason to follow.
 */
@Entity('order_sequences')
@TenantScoped()
export class OrderSequenceEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

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
