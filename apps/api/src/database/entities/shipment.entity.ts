import { Column, Entity } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const SHIPMENT_CARRIERS = [
  'DELHIVERY',
  'SHIPROCKET',
  'BLUEDART',
  'DTDC',
  'XPRESSBEES',
  'SELF',
  // Not part of docs/02 §12's list — the same dev/test carrier `CarrierName`
  // already carries elsewhere (Phase 6), allowed here for parity.
  'STUB',
] as const;
export type ShipmentCarrier = (typeof SHIPMENT_CARRIERS)[number];

export const SHIPMENT_STATUSES = [
  'PENDING',
  'LABEL_CREATED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED_DELIVERY',
  'RTO_INITIATED',
  'RTO_DELIVERED',
  'CANCELLED',
  'LOST',
  'DAMAGED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/**
 * Carrier-facing dispatch record for (some or all of) one order's items.
 *
 * Phase 5 only creates/tracks these manually (`SELF` carrier, statuses driven
 * by console action) — real carrier integration (rate calc, AWB generation,
 * label/manifest, webhook tracking sync) is Phase 6's `ShippingCarrierPort`.
 */
@Entity('shipments')
@TenantScoped()
export class ShipmentEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId!: string;

  @Column({ name: 'warehouse_id', type: 'bigint', unsigned: true, nullable: true })
  warehouseId!: string | null;

  @Column({ name: 'shipment_number', type: 'varchar', length: 64 })
  shipmentNumber!: string;

  @Column({ type: 'varchar', length: 32 })
  carrier!: ShipmentCarrier;

  @Column({ name: 'carrier_service', type: 'varchar', length: 64, nullable: true })
  carrierService!: string | null;

  @Column({ name: 'awb_number', type: 'varchar', length: 100, nullable: true })
  awbNumber!: string | null;

  @Column({ name: 'tracking_url', type: 'varchar', length: 1000, nullable: true })
  trackingUrl!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: ShipmentStatus;

  @Column({ name: 'weight_grams', type: 'int', unsigned: true, nullable: true })
  weightGrams!: number | null;

  @Column({ name: 'length_mm', type: 'int', unsigned: true, nullable: true })
  lengthMm!: number | null;

  @Column({ name: 'width_mm', type: 'int', unsigned: true, nullable: true })
  widthMm!: number | null;

  @Column({ name: 'height_mm', type: 'int', unsigned: true, nullable: true })
  heightMm!: number | null;

  @Column({ name: 'shipping_cost_minor', type: 'bigint', nullable: true })
  shippingCostMinor!: string | null;

  @Column({ name: 'cod_amount_minor', type: 'bigint', default: 0 })
  codAmountMinor!: string;

  @Column({ name: 'is_cod', ...BOOLEAN_COLUMN, default: 0 })
  isCod!: boolean;

  @Column({ name: 'label_url', type: 'varchar', length: 1000, nullable: true })
  labelUrl!: string | null;

  @Column({ name: 'manifest_url', type: 'varchar', length: 1000, nullable: true })
  manifestUrl!: string | null;

  @Column({ name: 'invoice_url', type: 'varchar', length: 1000, nullable: true })
  invoiceUrl!: string | null;

  @Column({ name: 'from_address', type: 'json', nullable: true })
  fromAddress!: Record<string, unknown> | null;

  @Column({ name: 'to_address', type: 'json', nullable: true })
  toAddress!: Record<string, unknown> | null;

  @Column({ name: 'pickup_scheduled_at', ...DATETIME3, nullable: true })
  pickupScheduledAt!: Date | null;

  @Column({ name: 'picked_up_at', ...DATETIME3, nullable: true })
  pickedUpAt!: Date | null;

  @Column({ name: 'shipped_at', ...DATETIME3, nullable: true })
  shippedAt!: Date | null;

  @Column({ name: 'expected_delivery_at', ...DATETIME3, nullable: true })
  expectedDeliveryAt!: Date | null;

  @Column({ name: 'delivered_at', ...DATETIME3, nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'rto_initiated_at', ...DATETIME3, nullable: true })
  rtoInitiatedAt!: Date | null;

  @Column({ name: 'carrier_response', type: 'json', nullable: true })
  carrierResponse!: Record<string, unknown> | null;

  @Column({ name: 'last_sync_at', ...DATETIME3, nullable: true })
  lastSyncAt!: Date | null;
}

@Entity('shipment_items')
@TenantScoped()
export class ShipmentItemEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'shipment_id', type: 'bigint', unsigned: true })
  shipmentId!: string;

  @Column({ name: 'order_item_id', type: 'bigint', unsigned: true })
  orderItemId!: string;

  @Column({ type: 'int', unsigned: true })
  quantity!: number;
}

/** Carrier tracking scans. `eventHash` dedupes replayed webhook/poll deliveries. */
@Entity('shipment_events')
@TenantScoped()
export class ShipmentEventEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'shipment_id', type: 'bigint', unsigned: true })
  shipmentId!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ name: 'carrier_status_code', type: 'varchar', length: 64, nullable: true })
  carrierStatusCode!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({ name: 'event_at', ...DATETIME3 })
  eventAt!: Date;

  @Column({ name: 'event_hash', type: 'char', length: 64 })
  eventHash!: string;

  @Column({ name: 'raw_payload', type: 'json', nullable: true })
  rawPayload!: Record<string, unknown> | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;
}
