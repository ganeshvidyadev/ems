import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 (part 1): inventory levels/movements, customers, customer addresses,
 * wishlist items.
 *
 * DDL matches docs/02-data-model.md §8–9 verbatim. `warehouses` (referenced by
 * `inventory_levels`/`inventory_movements`) already exists from `BillingAndStores`.
 *
 * One deliberate addition beyond the doc: none. Unlike `Catalog`, every table
 * here already carries a `public_id` where the doc's own convention calls for
 * one (customers, customer_addresses) and correctly omits it where a row is
 * never addressed by its own id (inventory_levels, inventory_movements,
 * wishlist_items).
 */
export class InventoryAndCustomers1786400000000 implements MigrationInterface {
  name = 'InventoryAndCustomers1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`inventory_levels\` (
        \`id\`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`          BIGINT UNSIGNED NOT NULL,
        \`warehouse_id\`       BIGINT UNSIGNED NOT NULL,
        \`product_id\`         BIGINT UNSIGNED NOT NULL,
        \`variant_id\`         BIGINT UNSIGNED NULL,
        \`quantity_on_hand\`   INT             NOT NULL DEFAULT 0,
        \`quantity_reserved\`  INT             NOT NULL DEFAULT 0,
        \`quantity_incoming\`  INT             NOT NULL DEFAULT 0,
        \`quantity_available\` INT AS (\`quantity_on_hand\` - \`quantity_reserved\`) STORED,
        \`reorder_point\`      INT UNSIGNED    NULL,
        \`reorder_quantity\`   INT UNSIGNED    NULL,
        \`bin_location\`       VARCHAR(64)     NULL,
        \`last_counted_at\`    DATETIME(3)     NULL,
        \`version\`            INT UNSIGNED    NOT NULL DEFAULT 0,
        \`created_at\`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_inventory_levels_slot\` (\`warehouse_id\`, \`product_id\`, (IFNULL(\`variant_id\`, 0))),
        KEY \`idx_inventory_levels_lookup\` (\`tenant_id\`, \`product_id\`, \`variant_id\`),
        KEY \`idx_inventory_levels_low_stock\` (\`tenant_id\`, \`quantity_available\`, \`reorder_point\`),
        CONSTRAINT \`fk_inventory_levels_warehouse\` FOREIGN KEY (\`warehouse_id\`) REFERENCES \`warehouses\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_inventory_levels_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_inventory_levels_variant\` FOREIGN KEY (\`variant_id\`) REFERENCES \`product_variants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_inventory_reserved\` CHECK (\`quantity_reserved\` >= 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`inventory_movements\` (
        \`id\`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`      BIGINT UNSIGNED NOT NULL,
        \`warehouse_id\`   BIGINT UNSIGNED NOT NULL,
        \`product_id\`     BIGINT UNSIGNED NOT NULL,
        \`variant_id\`     BIGINT UNSIGNED NULL,
        \`type\`           VARCHAR(32)     NOT NULL,
        \`quantity_delta\` INT             NOT NULL,
        \`quantity_after\` INT             NOT NULL,
        \`reference_type\` VARCHAR(32)     NULL,
        \`reference_id\`   BIGINT UNSIGNED NULL,
        \`unit_cost_minor\` BIGINT         NULL,
        \`reason\`         VARCHAR(255)    NULL,
        \`performed_by\`   BIGINT UNSIGNED NULL,
        \`correlation_id\` CHAR(26)        NULL,
        \`created_at\`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_inv_movements_item\` (\`tenant_id\`, \`product_id\`, \`variant_id\`, \`created_at\`),
        KEY \`idx_inv_movements_reference\` (\`reference_type\`, \`reference_id\`),
        KEY \`idx_inv_movements_warehouse_date\` (\`warehouse_id\`, \`created_at\`),
        CONSTRAINT \`fk_inv_movements_warehouse\` FOREIGN KEY (\`warehouse_id\`) REFERENCES \`warehouses\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_inv_movements_type\` CHECK (\`type\` IN
          ('PURCHASE','SALE','RETURN','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT',
           'DAMAGE','THEFT','EXPIRY','RESERVATION','RELEASE','COUNT_CORRECTION'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`customers\` (
        \`id\`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`            BIGINT UNSIGNED NOT NULL,
        \`store_id\`             BIGINT UNSIGNED NOT NULL,
        \`public_id\`            CHAR(26)        NOT NULL,
        \`email\`                VARCHAR(255)    NULL,
        \`email_normalized\`     VARCHAR(255)    NULL,
        \`phone_e164\`           VARCHAR(20)     NULL,
        \`password_hash\`        VARCHAR(255)    NULL,
        \`first_name\`           VARCHAR(100)    NULL,
        \`last_name\`            VARCHAR(100)    NULL,
        \`date_of_birth\`        DATE            NULL,
        \`gender\`               VARCHAR(20)     NULL,
        \`status\`               VARCHAR(32)     NOT NULL DEFAULT 'ACTIVE',
        \`is_guest\`             TINYINT(1)      NOT NULL DEFAULT 0,
        \`email_verified_at\`    DATETIME(3)     NULL,
        \`phone_verified_at\`    DATETIME(3)     NULL,
        \`accepts_marketing\`    TINYINT(1)      NOT NULL DEFAULT 0,
        \`marketing_consent_at\` DATETIME(3)     NULL,
        \`default_address_id\`  BIGINT UNSIGNED NULL,
        \`customer_group\`       VARCHAR(64)     NULL,
        \`tax_exempt\`           TINYINT(1)      NOT NULL DEFAULT 0,
        \`tax_registration\`     VARCHAR(64)     NULL,
        \`loyalty_points\`       INT             NOT NULL DEFAULT 0,
        \`total_orders\`         INT UNSIGNED    NOT NULL DEFAULT 0,
        \`total_spent_minor\`    BIGINT          NOT NULL DEFAULT 0,
        \`average_order_minor\` BIGINT          NOT NULL DEFAULT 0,
        \`first_order_at\`       DATETIME(3)     NULL,
        \`last_order_at\`        DATETIME(3)     NULL,
        \`notes\`                TEXT            NULL,
        \`tags\`                 JSON            NULL,
        \`created_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`           DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_customers_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_customers_store_email\` (\`tenant_id\`, \`store_id\`, \`email_normalized\`),
        KEY \`idx_customers_store_phone\` (\`tenant_id\`, \`store_id\`, \`phone_e164\`),
        KEY \`idx_customers_store_created\` (\`tenant_id\`, \`store_id\`, \`created_at\`),
        KEY \`idx_customers_spend\` (\`tenant_id\`, \`store_id\`, \`total_spent_minor\`),
        CONSTRAINT \`fk_customers_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_customers_status\` CHECK (\`status\` IN ('ACTIVE','BLOCKED','DEACTIVATED')),
        CONSTRAINT \`chk_customers_identity\` CHECK (\`email\` IS NOT NULL OR \`phone_e164\` IS NOT NULL)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`customer_addresses\` (
        \`id\`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`            BIGINT UNSIGNED NOT NULL,
        \`customer_id\`          BIGINT UNSIGNED NOT NULL,
        \`public_id\`            CHAR(26)        NOT NULL,
        \`label\`                VARCHAR(64)     NULL,
        \`type\`                 VARCHAR(16)     NOT NULL DEFAULT 'BOTH',
        \`recipient_name\`       VARCHAR(200)    NOT NULL,
        \`phone_e164\`           VARCHAR(20)     NULL,
        \`address_line1\`        VARCHAR(255)    NOT NULL,
        \`address_line2\`        VARCHAR(255)    NULL,
        \`landmark\`             VARCHAR(255)    NULL,
        \`city\`                 VARCHAR(120)    NOT NULL,
        \`state_code\`           VARCHAR(10)     NULL,
        \`state_name\`           VARCHAR(120)    NULL,
        \`postal_code\`          VARCHAR(20)     NOT NULL,
        \`country_code\`         CHAR(2)         NOT NULL DEFAULT 'IN',
        \`latitude\`             DECIMAL(10,7)   NULL,
        \`longitude\`            DECIMAL(10,7)   NULL,
        \`is_default_shipping\`  TINYINT(1)      NOT NULL DEFAULT 0,
        \`is_default_billing\`   TINYINT(1)      NOT NULL DEFAULT 0,
        \`created_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`           DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_customer_addresses_public_id\` (\`public_id\`),
        KEY \`idx_customer_addresses_customer\` (\`customer_id\`, \`deleted_at\`),
        CONSTRAINT \`fk_customer_addresses_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`wishlist_items\` (
        \`id\`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`   BIGINT UNSIGNED NOT NULL,
        \`customer_id\` BIGINT UNSIGNED NOT NULL,
        \`product_id\`  BIGINT UNSIGNED NOT NULL,
        \`variant_id\`  BIGINT UNSIGNED NULL,
        \`added_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_wishlist_item\` (\`customer_id\`, \`product_id\`, (IFNULL(\`variant_id\`, 0))),
        KEY \`idx_wishlist_product\` (\`tenant_id\`, \`product_id\`),
        CONSTRAINT \`fk_wishlist_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_wishlist_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `wishlist_items`');
    await queryRunner.query('DROP TABLE IF EXISTS `customer_addresses`');
    await queryRunner.query('DROP TABLE IF EXISTS `customers`');
    await queryRunner.query('DROP TABLE IF EXISTS `inventory_movements`');
    await queryRunner.query('DROP TABLE IF EXISTS `inventory_levels`');
  }
}
