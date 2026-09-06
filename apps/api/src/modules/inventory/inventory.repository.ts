import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { IsNull, type EntityManager } from 'typeorm';
import { InventoryLevelEntity, InventoryMovementEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

export interface InventorySlotFilter {
  warehouseId: string;
  productId: string;
  variantId: string | null;
}

@Injectable()
export class InventoryLevelRepository extends TenantScopedRepository<InventoryLevelEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, InventoryLevelEntity, context);
  }

  async findSlot(filter: InventorySlotFilter): Promise<InventoryLevelEntity | null> {
    return this.findOne({
      where: {
        warehouseId: filter.warehouseId,
        productId: filter.productId,
        variantId: filter.variantId ?? IsNull(),
      },
    });
  }

  async findByProduct(productId: string, variantId?: string | null): Promise<InventoryLevelEntity[]> {
    return this.find({
      where: {
        productId,
        ...(variantId === undefined ? {} : { variantId: variantId ?? IsNull() }),
      },
      order: { warehouseId: 'ASC' },
    });
  }

  /**
   * Creates the slot row if it does not already exist, at zero stock.
   *
   * `INSERT IGNORE` relies on `uq_inventory_levels_slot` to make a concurrent
   * double-create a no-op rather than a race — the row is then re-selected
   * either way, so the caller always gets a row back.
   */
  async ensureSlot(filter: InventorySlotFilter): Promise<InventoryLevelEntity> {
    const existing = await this.findSlot(filter);
    if (existing) return existing;

    await this.manager.query(
      `INSERT IGNORE INTO inventory_levels
         (tenant_id, warehouse_id, product_id, variant_id, quantity_on_hand, quantity_reserved, quantity_incoming)
       VALUES (?, ?, ?, ?, 0, 0, 0)`,
      [this.tenantId, filter.warehouseId, filter.productId, filter.variantId],
    );

    return this.findOneOrFail({
      where: {
        warehouseId: filter.warehouseId,
        productId: filter.productId,
        variantId: filter.variantId ?? IsNull(),
      },
    });
  }

  /**
   * Reserves `qty` against one slot with the conditional single-statement
   * update from docs/02 §8 — no read-then-write, so overselling across two
   * concurrent checkouts on the same slot is impossible at the database level.
   */
  async reserveConditional(id: string, qty: number): Promise<boolean> {
    const result = (await this.manager.query(
      `UPDATE inventory_levels
          SET quantity_reserved = quantity_reserved + ?, version = version + 1
        WHERE id = ? AND tenant_id = ?
          AND (quantity_on_hand - quantity_reserved) >= ?`,
      [qty, id, this.tenantId, qty],
    )) as { affectedRows: number };
    return result.affectedRows > 0;
  }

  async releaseReserved(id: string, qty: number): Promise<boolean> {
    const result = (await this.manager.query(
      `UPDATE inventory_levels
          SET quantity_reserved = GREATEST(quantity_reserved - ?, 0), version = version + 1
        WHERE id = ? AND tenant_id = ?`,
      [qty, id, this.tenantId],
    )) as { affectedRows: number };
    return result.affectedRows > 0;
  }

  /** Converts a reservation into a committed sale: both counters drop together. */
  async commitReserved(id: string, qty: number): Promise<boolean> {
    const result = (await this.manager.query(
      `UPDATE inventory_levels
          SET quantity_on_hand = quantity_on_hand - ?,
              quantity_reserved = quantity_reserved - ?,
              version = version + 1
        WHERE id = ? AND tenant_id = ?
          AND quantity_on_hand >= ? AND quantity_reserved >= ?`,
      [qty, qty, id, this.tenantId, qty, qty],
    )) as { affectedRows: number };
    return result.affectedRows > 0;
  }

  async adjustOnHand(id: string, delta: number): Promise<boolean> {
    const result = (await this.manager.query(
      `UPDATE inventory_levels
          SET quantity_on_hand = quantity_on_hand + ?, version = version + 1
        WHERE id = ? AND tenant_id = ? AND (quantity_on_hand + ?) >= 0`,
      [delta, id, this.tenantId, delta],
    )) as { affectedRows: number };
    return result.affectedRows > 0;
  }

  /** Warehouses ordered by fulfilment priority, joined for the allocation walk. */
  async warehouseCandidates(storeId: string): Promise<{ id: string; priority: number }[]> {
    return this.manager.query(
      `SELECT id, priority FROM warehouses
        WHERE tenant_id = ? AND is_active = 1 AND (store_id = ? OR store_id IS NULL) AND deleted_at IS NULL
        ORDER BY priority ASC, id ASC`,
      [this.tenantId, storeId],
    );
  }

  /** Comparing two columns isn't expressible via `FindOptionsWhere`, hence the query builder. */
  async listLowStock(limit: number): Promise<InventoryLevelEntity[]> {
    return this.repository
      .createQueryBuilder('level')
      .where('level.tenantId = :tenantId', { tenantId: this.tenantId })
      .andWhere('level.reorderPoint IS NOT NULL')
      .andWhere('level.quantityAvailable <= level.reorderPoint')
      .orderBy('level.quantityAvailable', 'ASC')
      .take(limit)
      .getMany();
  }
}

export interface RecordMovementInput {
  warehouseId: string;
  productId: string;
  variantId: string | null;
  type: InventoryMovementEntity['type'];
  quantityDelta: number;
  quantityAfter: number;
  referenceType?: string | null;
  referenceId?: string | null;
  unitCostMinor?: string | null;
  reason?: string | null;
  performedBy?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class InventoryMovementRepository extends TenantScopedRepository<InventoryMovementEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, InventoryMovementEntity, context);
  }

  async record(input: RecordMovementInput): Promise<InventoryMovementEntity> {
    return this.insert({
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId,
      type: input.type,
      quantityDelta: input.quantityDelta,
      quantityAfter: input.quantityAfter,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      unitCostMinor: input.unitCostMinor ?? null,
      reason: input.reason ?? null,
      performedBy: input.performedBy ?? null,
      correlationId: input.correlationId ?? null,
    });
  }

  async listByProduct(productId: string, page: number, limit: number) {
    return this.findAndCount({
      where: { productId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
