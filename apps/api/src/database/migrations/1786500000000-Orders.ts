import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 (part 2): orders, order items, order status history.
 *
 * DDL matches docs/02-data-model.md §10 verbatim. Carts are intentionally not a
 * table here — per the doc, Redis is the store of record for carts
 * (`cart:{tid}:{cartId}`), mirrored to MySQL only for signed-in customers via
 * the cart module's own sync path, not a dedicated schema.
 *
 * One deliberate addition beyond the doc: `order_sequences`. The doc requires
 * `order_number` to be "gapless per tenant" (§10) — the exact requirement
 * `invoice_sequences` already solves for subscription invoices, via a counter
 * row incremented under `SELECT ... FOR UPDATE` rather than `AUTO_INCREMENT`,
 * which loses a value on every rolled-back transaction. Reusing that pattern
 * here rather than inventing a second mechanism for the same problem.
 */
export class Orders1786500000000 implements MigrationInterface {
  name = 'Orders1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`orders\` (
        \`id\`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`             BIGINT UNSIGNED NOT NULL,
        \`store_id\`              BIGINT UNSIGNED NOT NULL,
        \`public_id\`             CHAR(26)        NOT NULL,
        \`order_number\`          VARCHAR(64)     NOT NULL,
        \`customer_id\`           BIGINT UNSIGNED NULL,
        \`email\`                 VARCHAR(255)    NULL,
        \`phone_e164\`            VARCHAR(20)     NULL,
        \`status\`                VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`payment_status\`        VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`fulfilment_status\`     VARCHAR(32)     NOT NULL DEFAULT 'UNFULFILLED',
        \`currency\`              CHAR(3)         NOT NULL,
        \`subtotal_minor\`        BIGINT          NOT NULL DEFAULT 0,
        \`discount_minor\`        BIGINT          NOT NULL DEFAULT 0,
        \`shipping_minor\`        BIGINT          NOT NULL DEFAULT 0,
        \`tax_minor\`             BIGINT          NOT NULL DEFAULT 0,
        \`cod_fee_minor\`         BIGINT          NOT NULL DEFAULT 0,
        \`round_off_minor\`       BIGINT          NOT NULL DEFAULT 0,
        \`total_minor\`           BIGINT          NOT NULL DEFAULT 0,
        \`amount_paid_minor\`     BIGINT          NOT NULL DEFAULT 0,
        \`amount_refunded_minor\` BIGINT          NOT NULL DEFAULT 0,
        \`shipping_address\`      JSON            NULL,
        \`billing_address\`       JSON            NULL,
        \`channel\`               VARCHAR(32)     NOT NULL DEFAULT 'WEB',
        \`channel_order_ref\`     VARCHAR(191)    NULL,
        \`is_marketplace_order\`  TINYINT(1)      NOT NULL DEFAULT 0,
        \`reseller_tenant_id\`    BIGINT UNSIGNED NULL,
        \`parent_order_id\`       BIGINT UNSIGNED NULL,
        \`coupon_id\`             BIGINT UNSIGNED NULL,
        \`coupon_code\`           VARCHAR(64)     NULL,
        \`customer_note\`         TEXT            NULL,
        \`internal_note\`         TEXT            NULL,
        \`tags\`                  JSON            NULL,
        \`cancel_reason\`         VARCHAR(255)    NULL,
        \`cancelled_at\`          DATETIME(3)     NULL,
        \`placed_at\`             DATETIME(3)     NULL,
        \`confirmed_at\`          DATETIME(3)     NULL,
        \`delivered_at\`          DATETIME(3)     NULL,
        \`closed_at\`             DATETIME(3)     NULL,
        \`ip_address\`            VARBINARY(16)   NULL,
        \`user_agent\`            VARCHAR(500)    NULL,
        \`utm\`                   JSON            NULL,
        \`correlation_id\`        CHAR(26)        NULL,
        \`version\`               INT UNSIGNED    NOT NULL DEFAULT 0,
        \`created_at\`            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_orders_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_orders_tenant_number\` (\`tenant_id\`, \`order_number\`),
        UNIQUE KEY \`uq_orders_channel_ref\` (\`tenant_id\`, \`channel\`, \`channel_order_ref\`),
        KEY \`idx_orders_listing\` (\`tenant_id\`, \`store_id\`, \`status\`, \`created_at\`),
        KEY \`idx_orders_customer\` (\`tenant_id\`, \`customer_id\`, \`created_at\`),
        KEY \`idx_orders_payment_status\` (\`tenant_id\`, \`payment_status\`, \`created_at\`),
        KEY \`idx_orders_fulfilment\` (\`tenant_id\`, \`fulfilment_status\`, \`created_at\`),
        KEY \`idx_orders_reseller\` (\`reseller_tenant_id\`, \`created_at\`),
        KEY \`idx_orders_parent\` (\`parent_order_id\`),
        KEY \`idx_orders_reporting\` (\`tenant_id\`, \`store_id\`, \`placed_at\`, \`total_minor\`),
        CONSTRAINT \`fk_orders_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_orders_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_orders_parent\` FOREIGN KEY (\`parent_order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_orders_status\` CHECK (\`status\` IN
          ('DRAFT','PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED',
           'COMPLETED','CANCELLED','RETURNED','FAILED','ON_HOLD')),
        CONSTRAINT \`chk_orders_payment_status\` CHECK (\`payment_status\` IN
          ('PENDING','AUTHORIZED','PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED','REFUNDED','FAILED','VOIDED')),
        CONSTRAINT \`chk_orders_fulfilment_status\` CHECK (\`fulfilment_status\` IN
          ('UNFULFILLED','PARTIALLY_FULFILLED','FULFILLED','RETURNED','PARTIALLY_RETURNED')),
        CONSTRAINT \`chk_orders_totals\` CHECK (\`total_minor\` >= 0 AND \`amount_refunded_minor\` <= \`amount_paid_minor\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`order_items\` (
        \`id\`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`           BIGINT UNSIGNED NOT NULL,
        \`order_id\`            BIGINT UNSIGNED NOT NULL,
        \`product_id\`          BIGINT UNSIGNED NULL,
        \`variant_id\`          BIGINT UNSIGNED NULL,
        \`sku\`                 VARCHAR(100)    NOT NULL,
        \`name\`                VARCHAR(500)    NOT NULL,
        \`variant_title\`       VARCHAR(255)    NULL,
        \`image_url\`           VARCHAR(1000)   NULL,
        \`hsn_code\`            VARCHAR(20)     NULL,
        \`quantity\`            INT UNSIGNED    NOT NULL,
        \`unit_price_minor\`    BIGINT          NOT NULL,
        \`unit_cost_minor\`     BIGINT          NULL,
        \`line_subtotal_minor\` BIGINT          NOT NULL,
        \`line_discount_minor\` BIGINT          NOT NULL DEFAULT 0,
        \`tax_rate\`            DECIMAL(7,4)    NOT NULL DEFAULT 0,
        \`line_tax_minor\`      BIGINT          NOT NULL DEFAULT 0,
        \`line_total_minor\`    BIGINT          NOT NULL,
        \`tax_breakup\`         JSON            NULL,
        \`quantity_fulfilled\`  INT UNSIGNED    NOT NULL DEFAULT 0,
        \`quantity_returned\`   INT UNSIGNED    NOT NULL DEFAULT 0,
        \`quantity_cancelled\`  INT UNSIGNED    NOT NULL DEFAULT 0,
        \`warehouse_id\`        BIGINT UNSIGNED NULL,
        \`supplier_tenant_id\`  BIGINT UNSIGNED NULL,
        \`commission_rate\`     DECIMAL(7,4)    NULL,
        \`commission_minor\`    BIGINT          NULL,
        \`properties\`          JSON            NULL,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_order_items_order\` (\`order_id\`),
        KEY \`idx_order_items_product\` (\`tenant_id\`, \`product_id\`),
        KEY \`idx_order_items_variant\` (\`tenant_id\`, \`variant_id\`),
        KEY \`idx_order_items_supplier\` (\`supplier_tenant_id\`, \`created_at\`),
        CONSTRAINT \`fk_order_items_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_order_items_qty\` CHECK (\`quantity\` > 0),
        CONSTRAINT \`chk_order_items_returned\` CHECK (\`quantity_returned\` <= \`quantity\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`order_status_history\` (
        \`id\`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`      BIGINT UNSIGNED NOT NULL,
        \`order_id\`       BIGINT UNSIGNED NOT NULL,
        \`status_type\`    VARCHAR(32)     NOT NULL,
        \`from_status\`    VARCHAR(32)     NULL,
        \`to_status\`      VARCHAR(32)     NOT NULL,
        \`reason\`         VARCHAR(500)    NULL,
        \`actor_type\`     VARCHAR(32)     NOT NULL,
        \`actor_id\`       BIGINT UNSIGNED NULL,
        \`metadata\`       JSON            NULL,
        \`correlation_id\` CHAR(26)        NULL,
        \`created_at\`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_order_status_history_order\` (\`order_id\`, \`created_at\`),
        CONSTRAINT \`fk_order_status_history_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`order_sequences\` (
        \`tenant_id\`   BIGINT UNSIGNED NOT NULL,
        \`last_number\` BIGINT UNSIGNED NOT NULL DEFAULT 0,
        \`updated_at\`  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`tenant_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `order_sequences`');
    await queryRunner.query('DROP TABLE IF EXISTS `order_status_history`');
    await queryRunner.query('DROP TABLE IF EXISTS `order_items`');
    await queryRunner.query('DROP TABLE IF EXISTS `orders`');
  }
}
