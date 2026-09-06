import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 10: multi-channel selling. DDL matches docs/02-data-model.md §17,
 * with one addition: `'STUB'` in `channels.type`'s CHECK constraint, for the
 * same reason `payment_gateway`/`shipping_carrier` include a stub value —
 * dev/test needs to exercise the full connect → publish → sync → import
 * lifecycle with no live marketplace account.
 *
 * Neither table gets a `public_id` column — the doc's own DDL never gives
 * them one, the same as `tenant_domains`, so the API addresses both by
 * internal id (see `TenantDomainEntity`/`DomainController` from Phase 8 for
 * the identical precedent).
 */
export class Channels1787200000000 implements MigrationInterface {
  name = 'Channels1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`channels\` (
        \`id\`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`             BIGINT UNSIGNED NOT NULL,
        \`store_id\`              BIGINT UNSIGNED NOT NULL,
        \`type\`                  VARCHAR(32)     NOT NULL,
        \`name\`                  VARCHAR(120)    NOT NULL,
        \`status\`                VARCHAR(32)     NOT NULL DEFAULT 'DISCONNECTED',
        \`credentials_encrypted\` VARBINARY(4096) NULL,
        \`external_account_id\`  VARCHAR(191)    NULL,
        \`marketplace_id\`       VARCHAR(64)     NULL,
        \`settings\`             JSON            NULL,
        \`inventory_buffer\`     INT UNSIGNED    NOT NULL DEFAULT 0,
        \`auto_publish\`         TINYINT(1)      NOT NULL DEFAULT 0,
        \`auto_import_orders\`   TINYINT(1)      NOT NULL DEFAULT 1,
        \`last_sync_at\`         DATETIME(3)     NULL,
        \`last_order_cursor\`    VARCHAR(191)    NULL,
        \`last_error\`           VARCHAR(1000)   NULL,
        \`token_expires_at\`     DATETIME(3)     NULL,
        \`created_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_channels_store_type\` (\`tenant_id\`, \`store_id\`, \`type\`),
        KEY \`idx_channels_sync\` (\`status\`, \`last_sync_at\`),
        KEY \`idx_channels_token_expiry\` (\`token_expires_at\`),
        CONSTRAINT \`fk_channels_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_channels_type\` CHECK (\`type\` IN
          ('AMAZON','FLIPKART','EBAY','FACEBOOK','INSTAGRAM','WHATSAPP','GOOGLE','STUB')),
        CONSTRAINT \`chk_channels_status\` CHECK (\`status\` IN
          ('DISCONNECTED','CONNECTING','CONNECTED','ERROR','TOKEN_EXPIRED','SUSPENDED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`channel_listings\` (
        \`id\`                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`              BIGINT UNSIGNED NOT NULL,
        \`channel_id\`             BIGINT UNSIGNED NOT NULL,
        \`product_id\`             BIGINT UNSIGNED NOT NULL,
        \`variant_id\`             BIGINT UNSIGNED NULL,
        \`external_listing_id\`    VARCHAR(191)    NULL,
        \`external_sku\`           VARCHAR(191)    NULL,
        \`status\`                 VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`channel_price_minor\`    BIGINT          NULL,
        \`channel_title\`          VARCHAR(500)    NULL,
        \`category_mapping\`      VARCHAR(191)    NULL,
        \`last_published_at\`      DATETIME(3)     NULL,
        \`last_inventory_sync_at\` DATETIME(3)     NULL,
        \`synced_quantity\`        INT             NULL,
        \`error_code\`             VARCHAR(64)     NULL,
        \`error_message\`          VARCHAR(1000)   NULL,
        \`created_at\`             DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`             DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_channel_listings\` (\`channel_id\`, \`product_id\`, (IFNULL(\`variant_id\`, 0))),
        KEY \`idx_channel_listings_external\` (\`channel_id\`, \`external_listing_id\`),
        KEY \`idx_channel_listings_status\` (\`tenant_id\`, \`channel_id\`, \`status\`),
        KEY \`idx_channel_listings_inventory_sync\` (\`channel_id\`, \`last_inventory_sync_at\`),
        CONSTRAINT \`fk_channel_listings_channel\` FOREIGN KEY (\`channel_id\`) REFERENCES \`channels\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_channel_listings_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_channel_listings_status\` CHECK (\`status\` IN
          ('PENDING','PUBLISHING','LIVE','PAUSED','REJECTED','ERROR','DELISTED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `channel_listings`');
    await queryRunner.query('DROP TABLE IF EXISTS `channels`');
  }
}
