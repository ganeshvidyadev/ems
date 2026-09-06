import { Column, Entity } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const RETURN_TYPES = ['RETURN', 'EXCHANGE', 'REPLACEMENT'] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];

export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'IN_TRANSIT',
  'RECEIVED',
  'INSPECTED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_REASONS = [
  'DAMAGED',
  'WRONG_ITEM',
  'SIZE_ISSUE',
  'NOT_AS_DESCRIBED',
  'CHANGED_MIND',
  'DEFECTIVE',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_INSPECTION_RESULTS = ['RESELLABLE', 'DAMAGED', 'SCRAP'] as const;
export type ReturnInspectionResult = (typeof RETURN_INSPECTION_RESULTS)[number];

/** RMA aggregate: request → approval → carrier transit → inspection → refund decision. */
@Entity('returns')
@TenantScoped()
export class ReturnEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId!: string;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true, nullable: true })
  customerId!: string | null;

  @Column({ name: 'rma_number', type: 'varchar', length: 64 })
  rmaNumber!: string;

  @Column({ type: 'varchar', length: 16, default: 'RETURN' })
  type!: ReturnType;

  @Column({ type: 'varchar', length: 32, default: 'REQUESTED' })
  status!: ReturnStatus;

  @Column({ type: 'varchar', length: 64 })
  reason!: ReturnReason;

  @Column({ name: 'reason_detail', type: 'text', nullable: true })
  reasonDetail!: string | null;

  @Column({ name: 'customer_images', type: 'json', nullable: true })
  customerImages!: string[] | null;

  @Column({ name: 'refund_amount_minor', type: 'bigint', nullable: true })
  refundAmountMinor!: string | null;

  @Column({ name: 'restocking_fee_minor', type: 'bigint', default: 0 })
  restockingFeeMinor!: string;

  @Column({ name: 'return_shipment_id', type: 'bigint', unsigned: true, nullable: true })
  returnShipmentId!: string | null;

  @Column({ name: 'approved_by', type: 'bigint', unsigned: true, nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', ...DATETIME3, nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejected_reason', type: 'varchar', length: 500, nullable: true })
  rejectedReason!: string | null;

  @Column({ name: 'received_at', ...DATETIME3, nullable: true })
  receivedAt!: Date | null;

  @Column({ name: 'inspected_at', ...DATETIME3, nullable: true })
  inspectedAt!: Date | null;

  @Column({ name: 'inspection_result', type: 'varchar', length: 32, nullable: true })
  inspectionResult!: ReturnInspectionResult | null;

  @Column({ name: 'completed_at', ...DATETIME3, nullable: true })
  completedAt!: Date | null;
}

@Entity('return_items')
@TenantScoped()
export class ReturnItemEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'return_id', type: 'bigint', unsigned: true })
  returnId!: string;

  @Column({ name: 'order_item_id', type: 'bigint', unsigned: true })
  orderItemId!: string;

  @Column({ type: 'int', unsigned: true })
  quantity!: number;

  @Column({ name: 'condition_note', type: 'varchar', length: 255, nullable: true })
  conditionNote!: string | null;

  @Column({ ...BOOLEAN_COLUMN, default: 1 })
  restock!: boolean;

  @Column({ name: 'refund_minor', type: 'bigint', nullable: true })
  refundMinor!: string | null;
}
