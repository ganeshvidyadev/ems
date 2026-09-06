import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 9: marketplace sharing, commission, settlement.
 *
 * DDL matches docs/02-data-model.md §16, with two additions the doc's own
 * DDL omits despite giving both tables a `public_id` column: `UNIQUE KEY`
 * on `product_shares.public_id` and `settlements.public_id` — the same gap
 * `Catalog`'s and `ThemingAndContent`'s migrations already found and fixed
 * for other tables. Enum-backed `CHECK` constraints beyond the doc's own are
 * added for the same reason every other table in this schema has them.
 *
 * `orders`/`order_items` already carry their marketplace columns
 * (`is_marketplace_order`, `reseller_tenant_id`, `parent_order_id`,
 * `supplier_tenant_id`, `commission_rate`, `commission_minor`) from Phase 5's
 * `Orders` migration, built ahead of this phase the same way theme/CMS
 * permissions were seeded ahead of Phase 7 — this migration only adds the
 * three tables that were still missing.
 */
export class Marketplace1787000000000 implements MigrationInterface {
  name = 'Marketplace1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`product_shares\` (
        \`id\`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`supplier_tenant_id\`   BIGINT UNSIGNED NOT NULL,
        \`reseller_tenant_id\`   BIGINT UNSIGNED NOT NULL,
        \`product_id\`           BIGINT UNSIGNED NOT NULL,
        \`public_id\`            CHAR(26)        NOT NULL,
        \`status\`               VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`commission_type\`      VARCHAR(32)     NOT NULL DEFAULT 'PERCENTAGE',
        \`commission_value\`     DECIMAL(12,4)   NOT NULL,
        \`platform_fee_rate\`    DECIMAL(7,4)    NOT NULL DEFAULT 0,
        \`reseller_price_minor\` BIGINT          NULL,
        \`min_price_minor\`      BIGINT          NULL,
        \`allow_price_override\` TINYINT(1)      NOT NULL DEFAULT 0,
        \`inventory_mode\`       VARCHAR(32)     NOT NULL DEFAULT 'SHARED',
        \`allocated_quantity\`   INT UNSIGNED    NULL,
        \`requested_by\`         BIGINT UNSIGNED NULL,
        \`approved_by\`          BIGINT UNSIGNED NULL,
        \`approved_at\`          DATETIME(3)     NULL,
        \`revoked_at\`           DATETIME(3)     NULL,
        \`created_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_product_shares_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_product_shares\` (\`supplier_tenant_id\`, \`reseller_tenant_id\`, \`product_id\`),
        KEY \`idx_product_shares_reseller\` (\`reseller_tenant_id\`, \`status\`),
        KEY \`idx_product_shares_product\` (\`product_id\`, \`status\`),
        CONSTRAINT \`fk_product_shares_supplier\` FOREIGN KEY (\`supplier_tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_product_shares_reseller\` FOREIGN KEY (\`reseller_tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_product_shares_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_product_shares_status\` CHECK (\`status\` IN ('PENDING','ACTIVE','PAUSED','REJECTED','REVOKED')),
        CONSTRAINT \`chk_product_shares_commission_type\` CHECK (\`commission_type\` IN ('PERCENTAGE','FIXED','MARGIN')),
        CONSTRAINT \`chk_product_shares_inventory_mode\` CHECK (\`inventory_mode\` IN ('SHARED','ALLOCATED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Append-only, double-entry. A correction is a REVERSAL row, never an
    // UPDATE — see docs/02 §16's own comment: mutable money records cannot be
    // audited, and merchants will dispute payouts.
    await queryRunner.query(`
      CREATE TABLE \`commission_ledger\` (
        \`id\`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`public_id\`             CHAR(26)        NOT NULL,
        \`order_id\`              BIGINT UNSIGNED NOT NULL,
        \`order_item_id\`         BIGINT UNSIGNED NULL,
        \`supplier_tenant_id\`    BIGINT UNSIGNED NOT NULL,
        \`reseller_tenant_id\`    BIGINT UNSIGNED NULL,
        \`entry_type\`            VARCHAR(32)     NOT NULL,
        \`direction\`             VARCHAR(8)      NOT NULL,
        \`beneficiary_type\`      VARCHAR(32)     NOT NULL,
        \`beneficiary_tenant_id\` BIGINT UNSIGNED NULL,
        \`gross_minor\`           BIGINT          NOT NULL,
        \`commission_minor\`      BIGINT          NOT NULL DEFAULT 0,
        \`platform_fee_minor\`    BIGINT          NOT NULL DEFAULT 0,
        \`tax_minor\`             BIGINT          NOT NULL DEFAULT 0,
        \`net_minor\`             BIGINT          NOT NULL,
        \`currency\`              CHAR(3)         NOT NULL,
        \`settlement_id\`         BIGINT UNSIGNED NULL,
        \`reverses_entry_id\`     BIGINT UNSIGNED NULL,
        \`description\`           VARCHAR(500)    NULL,
        \`correlation_id\`        CHAR(26)        NULL,
        \`created_at\`            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_commission_ledger_public_id\` (\`public_id\`),
        KEY \`idx_commission_ledger_beneficiary\` (\`beneficiary_tenant_id\`, \`settlement_id\`, \`created_at\`),
        KEY \`idx_commission_ledger_order\` (\`order_id\`),
        KEY \`idx_commission_ledger_unsettled\` (\`settlement_id\`, \`beneficiary_tenant_id\`),
        CONSTRAINT \`fk_commission_ledger_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_commission_ledger_direction\` CHECK (\`direction\` IN ('DEBIT','CREDIT')),
        CONSTRAINT \`chk_commission_ledger_entry_type\` CHECK (\`entry_type\` IN ('SALE','COMMISSION','PLATFORM_FEE','REFUND_REVERSAL','ADJUSTMENT')),
        CONSTRAINT \`chk_commission_ledger_beneficiary_type\` CHECK (\`beneficiary_type\` IN ('SUPPLIER','RESELLER','PLATFORM'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`settlements\` (
        \`id\`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`public_id\`            CHAR(26)        NOT NULL,
        \`beneficiary_tenant_id\` BIGINT UNSIGNED NOT NULL,
        \`settlement_number\`    VARCHAR(64)     NOT NULL,
        \`period_start\`         DATE            NOT NULL,
        \`period_end\`           DATE            NOT NULL,
        \`status\`               VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
        \`gross_minor\`          BIGINT          NOT NULL DEFAULT 0,
        \`commission_minor\`     BIGINT          NOT NULL DEFAULT 0,
        \`platform_fee_minor\`   BIGINT          NOT NULL DEFAULT 0,
        \`tax_minor\`            BIGINT          NOT NULL DEFAULT 0,
        \`adjustment_minor\`     BIGINT          NOT NULL DEFAULT 0,
        \`net_payable_minor\`    BIGINT          NOT NULL DEFAULT 0,
        \`currency\`             CHAR(3)         NOT NULL,
        \`entry_count\`          INT UNSIGNED    NOT NULL DEFAULT 0,
        \`payout_method\`        VARCHAR(32)     NULL,
        \`payout_reference\`     VARCHAR(191)    NULL,
        \`paid_at\`              DATETIME(3)     NULL,
        \`report_url\`           VARCHAR(500)    NULL,
        \`approved_by\`          BIGINT UNSIGNED NULL,
        \`created_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_settlements_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_settlements_number\` (\`settlement_number\`),
        UNIQUE KEY \`uq_settlements_period\` (\`beneficiary_tenant_id\`, \`period_start\`, \`period_end\`),
        KEY \`idx_settlements_status\` (\`status\`, \`period_end\`),
        CONSTRAINT \`fk_settlements_tenant\` FOREIGN KEY (\`beneficiary_tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_settlements_status\` CHECK (\`status\` IN ('DRAFT','PENDING_APPROVAL','APPROVED','PROCESSING','PAID','FAILED','ON_HOLD'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `settlements`');
    await queryRunner.query('DROP TABLE IF EXISTS `commission_ledger`');
    await queryRunner.query('DROP TABLE IF EXISTS `product_shares`');
  }
}
