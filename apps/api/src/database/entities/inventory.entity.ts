import { Column, Entity, VersionColumn } from 'typeorm';
import { DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const INVENTORY_MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'ADJUSTMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'DAMAGE',
  'THEFT',
  'EXPIRY',
  'RESERVATION',
  'RELEASE',
  'COUNT_CORRECTION',
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

/**
 * Current stock state for one (warehouse, product, variant) slot.
 *
 * No `public_id`: a level is never addressed by its own id in a URL, only ever
 * looked up by `(warehouseId, productId, variantId)` or listed for a product.
 *
 * `quantityAvailable` is a MySQL `STORED` generated column
 * (`quantity_on_hand - quantity_reserved`) — `insert`/`update` are both `false`
 * so TypeORM never tries to write it, only read it back.
 */
@Entity('inventory_levels')
@TenantScoped()
export class InventoryLevelEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'warehouse_id', type: 'bigint', unsigned: true })
  warehouseId!: string;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId!: string;

  @Column({ name: 'variant_id', type: 'bigint', unsigned: true, nullable: true })
  variantId!: string | null;

  @Column({ name: 'quantity_on_hand', type: 'int', default: 0 })
  quantityOnHand!: number;

  @Column({ name: 'quantity_reserved', type: 'int', default: 0 })
  quantityReserved!: number;

  @Column({ name: 'quantity_incoming', type: 'int', default: 0 })
  quantityIncoming!: number;

  @Column({ name: 'quantity_available', type: 'int', insert: false, update: false })
  quantityAvailable!: number;

  @Column({ name: 'reorder_point', type: 'int', unsigned: true, nullable: true })
  reorderPoint!: number | null;

  @Column({ name: 'reorder_quantity', type: 'int', unsigned: true, nullable: true })
  reorderQuantity!: number | null;

  @Column({ name: 'bin_location', type: 'varchar', length: 64, nullable: true })
  binLocation!: string | null;

  @Column({ name: 'last_counted_at', ...DATETIME3, nullable: true })
  lastCountedAt!: Date | null;

  /**
   * Optimistic lock, but the concurrency-critical path (reserve/release) never
   * relies on it — that path is the conditional single-statement `UPDATE ...
   * WHERE quantity_available >= :qty` from docs/02 §8, which needs no CAS retry
   * loop at all. `version` guards the slower admin paths (manual recount, bin
   * move) where a lost update is merely annoying rather than an oversell.
   */
  @VersionColumn({ name: 'version', type: 'int', unsigned: true, default: 0 })
  version!: number;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;
}

/**
 * Append-only stock ledger — never updated, only inserted.
 *
 * `quantityAfter` is a snapshot, not a derived value: it lets history be read
 * back directly ("what was the stock after this movement?") without replaying
 * every prior row, which matters once a SKU has years of movements.
 */
@Entity('inventory_movements')
@TenantScoped()
export class InventoryMovementEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'warehouse_id', type: 'bigint', unsigned: true })
  warehouseId!: string;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId!: string;

  @Column({ name: 'variant_id', type: 'bigint', unsigned: true, nullable: true })
  variantId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  type!: InventoryMovementType;

  @Column({ name: 'quantity_delta', type: 'int' })
  quantityDelta!: number;

  @Column({ name: 'quantity_after', type: 'int' })
  quantityAfter!: number;

  @Column({ name: 'reference_type', type: 'varchar', length: 32, nullable: true })
  referenceType!: string | null;

  @Column({ name: 'reference_id', type: 'bigint', unsigned: true, nullable: true })
  referenceId!: string | null;

  @Column({ name: 'unit_cost_minor', type: 'bigint', nullable: true })
  unitCostMinor!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @Column({ name: 'performed_by', type: 'bigint', unsigned: true, nullable: true })
  performedBy!: string | null;

  @Column({ name: 'correlation_id', type: 'char', length: 26, nullable: true })
  correlationId!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;
}
