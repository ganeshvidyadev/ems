import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 (part 3): order payments, refunds, shipments, returns.
 *
 * DDL matches docs/02-data-model.md §11–12 verbatim. `payments` here is
 * distinct from `subscription_payments` (`AuthTokens`/billing groundwork) —
 * that table settles platform invoices, this one settles shopper checkouts.
 */
export class PaymentsShippingReturns1786600000000 implements MigrationInterface {
  name = 'PaymentsShippingReturns1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`payments\` (
        \`id\`                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`               BIGINT UNSIGNED NOT NULL,
        \`store_id\`                BIGINT UNSIGNED NOT NULL,
        \`order_id\`                BIGINT UNSIGNED NULL,
        \`subscription_invoice_id\` BIGINT UNSIGNED NULL,
        \`public_id\`               CHAR(26)        NOT NULL,
        \`gateway\`                 VARCHAR(32)     NOT NULL,
        \`method\`                  VARCHAR(32)     NULL,
        \`status\`                  VARCHAR(32)     NOT NULL DEFAULT 'INITIATED',
        \`amount_minor\`            BIGINT          NOT NULL,
        \`currency\`                CHAR(3)         NOT NULL,
        \`amount_captured_minor\`   BIGINT          NOT NULL DEFAULT 0,
        \`amount_refunded_minor\`   BIGINT          NOT NULL DEFAULT 0,
        \`gateway_fee_minor\`       BIGINT          NULL,
        \`gateway_tax_minor\`       BIGINT          NULL,
        \`net_settlement_minor\`    BIGINT          NULL,
        \`gateway_payment_id\`      VARCHAR(191)    NULL,
        \`gateway_order_id\`        VARCHAR(191)    NULL,
        \`gateway_signature\`       VARCHAR(500)    NULL,
        \`card_last4\`              CHAR(4)         NULL,
        \`card_brand\`              VARCHAR(32)     NULL,
        \`card_network\`            VARCHAR(32)     NULL,
        \`upi_vpa\`                 VARCHAR(191)    NULL,
        \`bank_name\`               VARCHAR(120)    NULL,
        \`idempotency_key\`         CHAR(64)        NOT NULL,
        \`error_code\`              VARCHAR(64)     NULL,
        \`error_message\`           VARCHAR(500)    NULL,
        \`gateway_response\`        JSON            NULL,
        \`authorized_at\`           DATETIME(3)     NULL,
        \`captured_at\`             DATETIME(3)     NULL,
        \`failed_at\`               DATETIME(3)     NULL,
        \`reconciled_at\`           DATETIME(3)     NULL,
        \`correlation_id\`          CHAR(26)        NULL,
        \`version\`                 INT UNSIGNED    NOT NULL DEFAULT 0,
        \`created_at\`              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_payments_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_payments_idempotency\` (\`tenant_id\`, \`idempotency_key\`),
        UNIQUE KEY \`uq_payments_gateway_ref\` (\`gateway\`, \`gateway_payment_id\`),
        KEY \`idx_payments_order\` (\`order_id\`, \`status\`),
        KEY \`idx_payments_status_created\` (\`tenant_id\`, \`status\`, \`created_at\`),
        KEY \`idx_payments_reconcile\` (\`status\`, \`reconciled_at\`, \`created_at\`),
        KEY \`idx_payments_invoice\` (\`subscription_invoice_id\`),
        CONSTRAINT \`fk_payments_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_payments_status\` CHECK (\`status\` IN
          ('INITIATED','PENDING','AUTHORIZED','CAPTURED','PARTIALLY_REFUNDED',
           'REFUNDED','FAILED','CANCELLED','EXPIRED','DISPUTED')),
        CONSTRAINT \`chk_payments_amounts\` CHECK (
          \`amount_captured_minor\` <= \`amount_minor\` AND
          \`amount_refunded_minor\` <= \`amount_captured_minor\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`refunds\` (
        \`id\`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`         BIGINT UNSIGNED NOT NULL,
        \`payment_id\`        BIGINT UNSIGNED NOT NULL,
        \`order_id\`          BIGINT UNSIGNED NULL,
        \`return_id\`         BIGINT UNSIGNED NULL,
        \`public_id\`         CHAR(26)        NOT NULL,
        \`amount_minor\`      BIGINT          NOT NULL,
        \`currency\`          CHAR(3)         NOT NULL,
        \`reason\`            VARCHAR(255)    NULL,
        \`status\`            VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`gateway_refund_id\` VARCHAR(191)    NULL,
        \`idempotency_key\`   CHAR(64)        NOT NULL,
        \`speed\`             VARCHAR(16)     NULL,
        \`requested_by\`      BIGINT UNSIGNED NULL,
        \`approved_by\`       BIGINT UNSIGNED NULL,
        \`gateway_response\`  JSON            NULL,
        \`processed_at\`      DATETIME(3)     NULL,
        \`created_at\`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_refunds_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_refunds_idempotency\` (\`tenant_id\`, \`idempotency_key\`),
        KEY \`idx_refunds_payment\` (\`payment_id\`),
        KEY \`idx_refunds_order\` (\`order_id\`),
        KEY \`idx_refunds_status\` (\`tenant_id\`, \`status\`, \`created_at\`),
        CONSTRAINT \`fk_refunds_payment\` FOREIGN KEY (\`payment_id\`) REFERENCES \`payments\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_refunds_status\` CHECK (\`status\` IN ('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED')),
        CONSTRAINT \`chk_refunds_amount\` CHECK (\`amount_minor\` > 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`shipments\` (
        \`id\`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`            BIGINT UNSIGNED NOT NULL,
        \`order_id\`             BIGINT UNSIGNED NOT NULL,
        \`warehouse_id\`         BIGINT UNSIGNED NULL,
        \`public_id\`            CHAR(26)        NOT NULL,
        \`shipment_number\`      VARCHAR(64)     NOT NULL,
        \`carrier\`              VARCHAR(32)     NOT NULL,
        \`carrier_service\`      VARCHAR(64)     NULL,
        \`awb_number\`           VARCHAR(100)    NULL,
        \`tracking_url\`         VARCHAR(1000)   NULL,
        \`status\`               VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`weight_grams\`         INT UNSIGNED    NULL,
        \`length_mm\`            INT UNSIGNED    NULL,
        \`width_mm\`             INT UNSIGNED    NULL,
        \`height_mm\`            INT UNSIGNED    NULL,
        \`shipping_cost_minor\`  BIGINT          NULL,
        \`cod_amount_minor\`     BIGINT          NOT NULL DEFAULT 0,
        \`is_cod\`               TINYINT(1)      NOT NULL DEFAULT 0,
        \`label_url\`            VARCHAR(1000)   NULL,
        \`manifest_url\`         VARCHAR(1000)   NULL,
        \`invoice_url\`          VARCHAR(1000)   NULL,
        \`from_address\`         JSON            NULL,
        \`to_address\`           JSON            NULL,
        \`pickup_scheduled_at\`  DATETIME(3)     NULL,
        \`picked_up_at\`         DATETIME(3)     NULL,
        \`shipped_at\`           DATETIME(3)     NULL,
        \`expected_delivery_at\` DATETIME(3)     NULL,
        \`delivered_at\`         DATETIME(3)     NULL,
        \`rto_initiated_at\`     DATETIME(3)     NULL,
        \`carrier_response\`     JSON            NULL,
        \`last_sync_at\`         DATETIME(3)     NULL,
        \`created_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_shipments_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_shipments_tenant_number\` (\`tenant_id\`, \`shipment_number\`),
        UNIQUE KEY \`uq_shipments_carrier_awb\` (\`carrier\`, \`awb_number\`),
        KEY \`idx_shipments_order\` (\`order_id\`),
        KEY \`idx_shipments_status\` (\`tenant_id\`, \`status\`, \`created_at\`),
        KEY \`idx_shipments_tracking_sync\` (\`status\`, \`last_sync_at\`),
        CONSTRAINT \`fk_shipments_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_shipments_status\` CHECK (\`status\` IN
          ('PENDING','LABEL_CREATED','PICKUP_SCHEDULED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY',
           'DELIVERED','FAILED_DELIVERY','RTO_INITIATED','RTO_DELIVERED','CANCELLED','LOST','DAMAGED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`shipment_items\` (
        \`id\`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`     BIGINT UNSIGNED NOT NULL,
        \`shipment_id\`   BIGINT UNSIGNED NOT NULL,
        \`order_item_id\` BIGINT UNSIGNED NOT NULL,
        \`quantity\`      INT UNSIGNED    NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_shipment_items\` (\`shipment_id\`, \`order_item_id\`),
        CONSTRAINT \`fk_shipment_items_shipment\` FOREIGN KEY (\`shipment_id\`) REFERENCES \`shipments\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_shipment_items_order_item\` FOREIGN KEY (\`order_item_id\`) REFERENCES \`order_items\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`shipment_events\` (
        \`id\`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`           BIGINT UNSIGNED NOT NULL,
        \`shipment_id\`         BIGINT UNSIGNED NOT NULL,
        \`status\`              VARCHAR(32)     NOT NULL,
        \`carrier_status_code\` VARCHAR(64)     NULL,
        \`description\`         VARCHAR(500)    NULL,
        \`location\`            VARCHAR(255)    NULL,
        \`event_at\`            DATETIME(3)     NOT NULL,
        \`event_hash\`          CHAR(64)        NOT NULL,
        \`raw_payload\`         JSON            NULL,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_shipment_events_dedupe\` (\`shipment_id\`, \`event_hash\`),
        KEY \`idx_shipment_events_shipment\` (\`shipment_id\`, \`event_at\`),
        CONSTRAINT \`fk_shipment_events_shipment\` FOREIGN KEY (\`shipment_id\`) REFERENCES \`shipments\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`returns\` (
        \`id\`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`            BIGINT UNSIGNED NOT NULL,
        \`order_id\`             BIGINT UNSIGNED NOT NULL,
        \`customer_id\`          BIGINT UNSIGNED NULL,
        \`public_id\`            CHAR(26)        NOT NULL,
        \`rma_number\`           VARCHAR(64)     NOT NULL,
        \`type\`                 VARCHAR(16)     NOT NULL DEFAULT 'RETURN',
        \`status\`               VARCHAR(32)     NOT NULL DEFAULT 'REQUESTED',
        \`reason\`               VARCHAR(64)     NOT NULL,
        \`reason_detail\`        TEXT            NULL,
        \`customer_images\`      JSON            NULL,
        \`refund_amount_minor\`  BIGINT          NULL,
        \`restocking_fee_minor\` BIGINT          NOT NULL DEFAULT 0,
        \`return_shipment_id\`   BIGINT UNSIGNED NULL,
        \`approved_by\`          BIGINT UNSIGNED NULL,
        \`approved_at\`          DATETIME(3)     NULL,
        \`rejected_reason\`      VARCHAR(500)    NULL,
        \`received_at\`          DATETIME(3)     NULL,
        \`inspected_at\`         DATETIME(3)     NULL,
        \`inspection_result\`    VARCHAR(32)     NULL,
        \`completed_at\`         DATETIME(3)     NULL,
        \`created_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_returns_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_returns_tenant_rma\` (\`tenant_id\`, \`rma_number\`),
        KEY \`idx_returns_order\` (\`order_id\`),
        KEY \`idx_returns_status\` (\`tenant_id\`, \`status\`, \`created_at\`),
        CONSTRAINT \`fk_returns_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_returns_status\` CHECK (\`status\` IN
          ('REQUESTED','APPROVED','REJECTED','IN_TRANSIT','RECEIVED','INSPECTED','COMPLETED','CANCELLED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`return_items\` (
        \`id\`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`      BIGINT UNSIGNED NOT NULL,
        \`return_id\`      BIGINT UNSIGNED NOT NULL,
        \`order_item_id\`  BIGINT UNSIGNED NOT NULL,
        \`quantity\`       INT UNSIGNED    NOT NULL,
        \`condition_note\` VARCHAR(255)    NULL,
        \`restock\`        TINYINT(1)      NOT NULL DEFAULT 1,
        \`refund_minor\`   BIGINT          NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_return_items\` (\`return_id\`, \`order_item_id\`),
        CONSTRAINT \`fk_return_items_return\` FOREIGN KEY (\`return_id\`) REFERENCES \`returns\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_return_items_order_item\` FOREIGN KEY (\`order_item_id\`) REFERENCES \`order_items\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `return_items`');
    await queryRunner.query('DROP TABLE IF EXISTS `returns`');
    await queryRunner.query('DROP TABLE IF EXISTS `shipment_events`');
    await queryRunner.query('DROP TABLE IF EXISTS `shipment_items`');
    await queryRunner.query('DROP TABLE IF EXISTS `shipments`');
    await queryRunner.query('DROP TABLE IF EXISTS `refunds`');
    await queryRunner.query('DROP TABLE IF EXISTS `payments`');
  }
}
