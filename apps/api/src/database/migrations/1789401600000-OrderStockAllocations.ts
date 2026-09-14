import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderStockAllocations1789401600000 implements MigrationInterface {
  name = 'OrderStockAllocations1789401600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Do not invent warehouse distribution for old orders. Their movement ledger
    // must be reconciled before a historical split allocation can be recovered.
    await queryRunner.query('ALTER TABLE order_items ADD COLUMN stock_allocations JSON NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE order_items DROP COLUMN stock_allocations');
  }
}
