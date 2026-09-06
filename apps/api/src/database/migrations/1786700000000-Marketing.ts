import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 (part 4): coupons, gift cards, loyalty ledger, reviews.
 *
 * DDL matches docs/02-data-model.md §14 verbatim.
 */
export class Marketing1786700000000 implements MigrationInterface {
  name = 'Marketing1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`coupons\` (
        \`id\`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`                BIGINT UNSIGNED NOT NULL,
        \`store_id\`                 BIGINT UNSIGNED NULL,
        \`public_id\`                CHAR(26)        NOT NULL,
        \`code\`                     VARCHAR(64)     NOT NULL,
        \`name\`                     VARCHAR(255)    NULL,
        \`description\`              VARCHAR(500)    NULL,
        \`discount_type\`            VARCHAR(32)     NOT NULL,
        \`discount_value\`           DECIMAL(12,4)   NOT NULL,
        \`max_discount_minor\`       BIGINT          NULL,
        \`min_order_minor\`          BIGINT          NULL,
        \`applies_to\`               VARCHAR(32)     NOT NULL DEFAULT 'ORDER',
        \`target_ids\`               JSON            NULL,
        \`excluded_ids\`             JSON            NULL,
        \`buy_quantity\`             INT UNSIGNED    NULL,
        \`get_quantity\`             INT UNSIGNED    NULL,
        \`usage_limit_total\`        INT UNSIGNED    NULL,
        \`usage_limit_per_customer\` INT UNSIGNED    NULL,
        \`usage_count\`              INT UNSIGNED    NOT NULL DEFAULT 0,
        \`customer_eligibility\`     VARCHAR(32)     NOT NULL DEFAULT 'ALL',
        \`eligible_customer_ids\`    JSON            NULL,
        \`eligible_group\`           VARCHAR(64)     NULL,
        \`combinable\`               TINYINT(1)      NOT NULL DEFAULT 0,
        \`auto_apply\`               TINYINT(1)      NOT NULL DEFAULT 0,
        \`starts_at\`                DATETIME(3)     NULL,
        \`ends_at\`                  DATETIME(3)     NULL,
        \`status\`                   VARCHAR(32)     NOT NULL DEFAULT 'ACTIVE',
        \`created_by\`               BIGINT UNSIGNED NULL,
        \`created_at\`               DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`               DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`               DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_coupons_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_coupons_tenant_code\` (\`tenant_id\`, \`code\`),
        KEY \`idx_coupons_active\` (\`tenant_id\`, \`status\`, \`starts_at\`, \`ends_at\`),
        CONSTRAINT \`fk_coupons_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_coupons_type\` CHECK (\`discount_type\` IN
          ('PERCENTAGE','FIXED_AMOUNT','FREE_SHIPPING','BUY_X_GET_Y')),
        CONSTRAINT \`chk_coupons_window\` CHECK (\`ends_at\` IS NULL OR \`starts_at\` IS NULL OR \`ends_at\` > \`starts_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`coupon_redemptions\` (
        \`id\`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`      BIGINT UNSIGNED NOT NULL,
        \`coupon_id\`      BIGINT UNSIGNED NOT NULL,
        \`order_id\`       BIGINT UNSIGNED NOT NULL,
        \`customer_id\`    BIGINT UNSIGNED NULL,
        \`discount_minor\` BIGINT          NOT NULL,
        \`redeemed_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_coupon_redemptions_order\` (\`coupon_id\`, \`order_id\`),
        KEY \`idx_coupon_redemptions_customer\` (\`coupon_id\`, \`customer_id\`),
        CONSTRAINT \`fk_coupon_redemptions_coupon\` FOREIGN KEY (\`coupon_id\`) REFERENCES \`coupons\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_coupon_redemptions_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`gift_cards\` (
        \`id\`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`             BIGINT UNSIGNED NOT NULL,
        \`public_id\`             CHAR(26)        NOT NULL,
        \`code_hash\`             CHAR(64)        NOT NULL,
        \`code_last4\`            CHAR(4)         NOT NULL,
        \`initial_value_minor\`   BIGINT          NOT NULL,
        \`balance_minor\`         BIGINT          NOT NULL,
        \`currency\`              CHAR(3)         NOT NULL,
        \`status\`                VARCHAR(32)     NOT NULL DEFAULT 'ACTIVE',
        \`issued_to_customer_id\` BIGINT UNSIGNED NULL,
        \`issued_to_email\`       VARCHAR(255)    NULL,
        \`order_id\`              BIGINT UNSIGNED NULL,
        \`expires_at\`            DATETIME(3)     NULL,
        \`created_at\`            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_gift_cards_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_gift_cards_code_hash\` (\`code_hash\`),
        KEY \`idx_gift_cards_customer\` (\`tenant_id\`, \`issued_to_customer_id\`),
        CONSTRAINT \`fk_gift_cards_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_gift_cards_balance\` CHECK (\`balance_minor\` >= 0 AND \`balance_minor\` <= \`initial_value_minor\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`loyalty_transactions\` (
        \`id\`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`     BIGINT UNSIGNED NOT NULL,
        \`customer_id\`   BIGINT UNSIGNED NOT NULL,
        \`type\`          VARCHAR(32)     NOT NULL,
        \`points_delta\`  INT             NOT NULL,
        \`points_after\`  INT             NOT NULL,
        \`order_id\`      BIGINT UNSIGNED NULL,
        \`description\`   VARCHAR(255)    NULL,
        \`expires_at\`    DATETIME(3)     NULL,
        \`created_by\`    BIGINT UNSIGNED NULL,
        \`created_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_loyalty_customer\` (\`customer_id\`, \`created_at\`),
        KEY \`idx_loyalty_expiry\` (\`tenant_id\`, \`expires_at\`, \`type\`),
        CONSTRAINT \`fk_loyalty_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`reviews\` (
        \`id\`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`           BIGINT UNSIGNED NOT NULL,
        \`store_id\`            BIGINT UNSIGNED NOT NULL,
        \`product_id\`          BIGINT UNSIGNED NOT NULL,
        \`customer_id\`         BIGINT UNSIGNED NULL,
        \`order_item_id\`       BIGINT UNSIGNED NULL,
        \`public_id\`           CHAR(26)        NOT NULL,
        \`rating\`              TINYINT UNSIGNED NOT NULL,
        \`title\`               VARCHAR(255)    NULL,
        \`body\`                TEXT            NULL,
        \`author_name\`         VARCHAR(120)    NULL,
        \`images\`              JSON            NULL,
        \`status\`              VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`is_verified_purchase\` TINYINT(1)     NOT NULL DEFAULT 0,
        \`helpful_count\`       INT UNSIGNED    NOT NULL DEFAULT 0,
        \`merchant_reply\`      TEXT            NULL,
        \`merchant_replied_at\` DATETIME(3)     NULL,
        \`moderated_by\`        BIGINT UNSIGNED NULL,
        \`moderated_at\`        DATETIME(3)     NULL,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`          DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_reviews_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_reviews_order_item\` (\`customer_id\`, \`order_item_id\`),
        KEY \`idx_reviews_product\` (\`tenant_id\`, \`product_id\`, \`status\`, \`created_at\`),
        KEY \`idx_reviews_moderation\` (\`tenant_id\`, \`status\`, \`created_at\`),
        CONSTRAINT \`fk_reviews_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_reviews_rating\` CHECK (\`rating\` BETWEEN 1 AND 5),
        CONSTRAINT \`chk_reviews_status\` CHECK (\`status\` IN ('PENDING','APPROVED','REJECTED','SPAM'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `reviews`');
    await queryRunner.query('DROP TABLE IF EXISTS `loyalty_transactions`');
    await queryRunner.query('DROP TABLE IF EXISTS `gift_cards`');
    await queryRunner.query('DROP TABLE IF EXISTS `coupon_redemptions`');
    await queryRunner.query('DROP TABLE IF EXISTS `coupons`');
  }
}
