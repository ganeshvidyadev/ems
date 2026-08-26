import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4: catalog — brands, categories, tax, products, variants, media,
 * product-category links, normalized attributes.
 *
 * DDL matches docs/02-data-model.md §7 and §13 verbatim; every column already precedes
 * its key/constraint clauses there, so (unlike `BillingAndStores`) no reordering was
 * needed. `tax_classes`/`tax_rates` are created before `products` because
 * `products.tax_class_id` references `tax_classes`.
 *
 * Three deliberate additions beyond the doc's DDL:
 *
 *  1. `product_media.status` (PENDING|READY|FAILED). The upload flow is presigned direct
 *     upload — the row is created *before* the file exists in S3, so there has to be a
 *     state for "URL issued, not yet confirmed/processed" distinct from a fully
 *     thumbnailed, ready-to-serve asset.
 *  2. `fk_products_tax_class` + `idx_products_tax_class`. The doc declares the column but
 *     not the constraint/index; every other nullable FK on `products` (brand) has both,
 *     and an unindexed FK column is a predictable slow join once tax classes are used in
 *     product listing filters.
 *  3. `tax_classes.public_id` / `tax_rates.public_id` / `product_attributes.public_id`.
 *     Every other entity in this codebase exposes a ULID externally and keeps the numeric
 *     id internal (docs/01 — never let a caller enumerate `/tax-classes/1`,
 *     `/tax-classes/2`); the doc's DDL for these tables omitted the column, which would
 *     have been the only tenant-owned, individually-addressable tables in the schema
 *     without one. (`product_attribute_values`, `product_media` and `product_categories`
 *     stay without one deliberately — none is ever addressed by its own id in a URL.)
 */
export class Catalog1786060800000 implements MigrationInterface {
  name = 'Catalog1786060800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`brands\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`        BIGINT UNSIGNED NOT NULL,
        \`public_id\`        CHAR(26)        NOT NULL,
        \`name\`             VARCHAR(255)    NOT NULL,
        \`slug\`             VARCHAR(255)    NOT NULL,
        \`logo_url\`         VARCHAR(500)    NULL,
        \`description\`      TEXT            NULL,
        \`meta_title\`       VARCHAR(255)    NULL,
        \`meta_description\` VARCHAR(500)    NULL,
        \`is_active\`        TINYINT(1)      NOT NULL DEFAULT 1,
        \`created_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`       DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_brands_tenant_slug\` (\`tenant_id\`, \`slug\`),
        KEY \`idx_brands_tenant_active\` (\`tenant_id\`, \`is_active\`),
        CONSTRAINT \`fk_brands_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`categories\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`        BIGINT UNSIGNED NOT NULL,
        \`store_id\`         BIGINT UNSIGNED NULL,
        \`public_id\`        CHAR(26)        NOT NULL,
        \`parent_id\`        BIGINT UNSIGNED NULL,
        \`name\`             VARCHAR(255)    NOT NULL,
        \`slug\`             VARCHAR(255)    NOT NULL,
        \`path\`             VARCHAR(1000)   NOT NULL,
        \`depth\`            TINYINT UNSIGNED NOT NULL DEFAULT 0,
        \`description\`      TEXT            NULL,
        \`image_url\`        VARCHAR(500)    NULL,
        \`banner_url\`       VARCHAR(500)    NULL,
        \`sort_order\`       INT             NOT NULL DEFAULT 0,
        \`product_count\`    INT UNSIGNED    NOT NULL DEFAULT 0,
        \`meta_title\`       VARCHAR(255)    NULL,
        \`meta_description\` VARCHAR(500)    NULL,
        \`is_active\`        TINYINT(1)      NOT NULL DEFAULT 1,
        \`show_in_menu\`     TINYINT(1)      NOT NULL DEFAULT 1,
        \`created_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`       DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_categories_tenant_slug\` (\`tenant_id\`, \`store_id\`, \`slug\`),
        KEY \`idx_categories_tenant_parent\` (\`tenant_id\`, \`parent_id\`, \`sort_order\`),
        KEY \`idx_categories_path\` (\`tenant_id\`, \`path\`(255)),
        CONSTRAINT \`fk_categories_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_categories_parent\` FOREIGN KEY (\`parent_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`tax_classes\` (
        \`id\`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`  BIGINT UNSIGNED NOT NULL,
        \`public_id\`  CHAR(26)        NOT NULL,
        \`code\`       VARCHAR(64)     NOT NULL,
        \`name\`       VARCHAR(120)    NOT NULL,
        \`is_default\` TINYINT(1)      NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_tax_classes_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_tax_classes_tenant_code\` (\`tenant_id\`, \`code\`),
        CONSTRAINT \`fk_tax_classes_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`tax_rates\` (
        \`id\`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`      BIGINT UNSIGNED NOT NULL,
        \`public_id\`      CHAR(26)        NOT NULL,
        \`tax_class_id\`   BIGINT UNSIGNED NOT NULL,
        \`name\`           VARCHAR(120)    NOT NULL,
        \`country_code\`   CHAR(2)         NOT NULL,
        \`state_code\`     VARCHAR(10)     NULL,
        \`postal_pattern\` VARCHAR(64)     NULL,
        \`rate\`           DECIMAL(7,4)    NOT NULL,
        \`compound\`       TINYINT(1)      NOT NULL DEFAULT 0,
        \`priority\`       SMALLINT        NOT NULL DEFAULT 0,
        \`is_inclusive\`   TINYINT(1)      NOT NULL DEFAULT 0,
        \`components\`     JSON            NULL,
        \`effective_from\` DATE            NULL,
        \`effective_to\`   DATE            NULL,
        \`created_at\`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_tax_rates_public_id\` (\`public_id\`),
        KEY \`idx_tax_rates_lookup\` (\`tenant_id\`, \`tax_class_id\`, \`country_code\`, \`state_code\`, \`priority\`),
        CONSTRAINT \`fk_tax_rates_class\` FOREIGN KEY (\`tax_class_id\`) REFERENCES \`tax_classes\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_tax_rates_rate\` CHECK (\`rate\` >= 0 AND \`rate\` <= 100)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`products\` (
        \`id\`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`           BIGINT UNSIGNED NOT NULL,
        \`store_id\`            BIGINT UNSIGNED NOT NULL,
        \`public_id\`           CHAR(26)        NOT NULL,
        \`brand_id\`            BIGINT UNSIGNED NULL,
        \`tax_class_id\`        BIGINT UNSIGNED NULL,
        \`type\`                VARCHAR(32)     NOT NULL DEFAULT 'SIMPLE',
        \`name\`                VARCHAR(500)    NOT NULL,
        \`slug\`                VARCHAR(500)    NOT NULL,
        \`sku\`                 VARCHAR(100)    NULL,
        \`short_description\`   VARCHAR(1000)   NULL,
        \`description\`         MEDIUMTEXT      NULL,
        \`status\`              VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
        \`visibility\`          VARCHAR(32)     NOT NULL DEFAULT 'VISIBLE',
        \`price_minor\`         BIGINT          NOT NULL DEFAULT 0,
        \`compare_price_minor\` BIGINT          NULL,
        \`cost_price_minor\`    BIGINT          NULL,
        \`currency\`            CHAR(3)         NOT NULL DEFAULT 'INR',
        \`track_inventory\`     TINYINT(1)      NOT NULL DEFAULT 1,
        \`allow_backorder\`     TINYINT(1)      NOT NULL DEFAULT 0,
        \`low_stock_threshold\` INT UNSIGNED    NULL,
        \`weight_grams\`        INT UNSIGNED    NULL,
        \`length_mm\`           INT UNSIGNED    NULL,
        \`width_mm\`            INT UNSIGNED    NULL,
        \`height_mm\`           INT UNSIGNED    NULL,
        \`barcode\`             VARCHAR(100)    NULL,
        \`hsn_code\`            VARCHAR(20)     NULL,
        \`requires_shipping\`   TINYINT(1)      NOT NULL DEFAULT 1,
        \`is_featured\`         TINYINT(1)      NOT NULL DEFAULT 0,
        \`is_shareable\`        TINYINT(1)      NOT NULL DEFAULT 0,
        \`meta_title\`          VARCHAR(255)    NULL,
        \`meta_description\`    VARCHAR(500)    NULL,
        \`meta_keywords\`       VARCHAR(500)    NULL,
        \`attributes\`          JSON            NULL,
        \`rating_average\`      DECIMAL(3,2)    NOT NULL DEFAULT 0.00,
        \`rating_count\`        INT UNSIGNED    NOT NULL DEFAULT 0,
        \`total_sold\`          INT UNSIGNED    NOT NULL DEFAULT 0,
        \`published_at\`        DATETIME(3)     NULL,
        \`version\`             INT UNSIGNED    NOT NULL DEFAULT 0,
        \`created_by\`          BIGINT UNSIGNED NULL,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`          DATETIME(3)     NULL,
        \`is_live\`             TINYINT(1) AS (CASE WHEN \`deleted_at\` IS NULL THEN 1 ELSE 0 END) STORED,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_products_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_products_tenant_slug\` (\`tenant_id\`, \`store_id\`, \`slug\`),
        UNIQUE KEY \`uq_products_tenant_sku\` (\`tenant_id\`, \`sku\`),
        KEY \`idx_products_listing\` (\`tenant_id\`, \`store_id\`, \`status\`, \`visibility\`, \`is_live\`, \`published_at\`),
        KEY \`idx_products_brand\` (\`tenant_id\`, \`brand_id\`, \`is_live\`),
        KEY \`idx_products_featured\` (\`tenant_id\`, \`store_id\`, \`is_featured\`, \`is_live\`),
        KEY \`idx_products_barcode\` (\`tenant_id\`, \`barcode\`),
        KEY \`idx_products_shareable\` (\`tenant_id\`, \`is_shareable\`, \`status\`),
        KEY \`idx_products_tax_class\` (\`tax_class_id\`),
        FULLTEXT KEY \`ft_products_search\` (\`name\`, \`short_description\`, \`meta_keywords\`),
        CONSTRAINT \`fk_products_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_products_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_products_brand\` FOREIGN KEY (\`brand_id\`) REFERENCES \`brands\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_products_tax_class\` FOREIGN KEY (\`tax_class_id\`) REFERENCES \`tax_classes\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`chk_products_status\` CHECK (\`status\` IN ('DRAFT','ACTIVE','ARCHIVED','OUT_OF_STOCK')),
        CONSTRAINT \`chk_products_price\` CHECK (\`price_minor\` >= 0),
        CONSTRAINT \`chk_products_compare\` CHECK (\`compare_price_minor\` IS NULL OR \`compare_price_minor\` >= \`price_minor\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_variants\` (
        \`id\`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`           BIGINT UNSIGNED NOT NULL,
        \`product_id\`          BIGINT UNSIGNED NOT NULL,
        \`public_id\`           CHAR(26)        NOT NULL,
        \`sku\`                 VARCHAR(100)    NOT NULL,
        \`barcode\`             VARCHAR(100)    NULL,
        \`title\`               VARCHAR(255)    NULL,
        \`option_values\`       JSON            NOT NULL,
        \`option_signature\`    CHAR(64)        NOT NULL,
        \`price_minor\`         BIGINT          NOT NULL,
        \`compare_price_minor\` BIGINT          NULL,
        \`cost_price_minor\`    BIGINT          NULL,
        \`weight_grams\`        INT UNSIGNED    NULL,
        \`image_id\`            BIGINT UNSIGNED NULL,
        \`position\`            SMALLINT        NOT NULL DEFAULT 0,
        \`is_active\`           TINYINT(1)      NOT NULL DEFAULT 1,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`          DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_variants_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_variants_tenant_sku\` (\`tenant_id\`, \`sku\`),
        UNIQUE KEY \`uq_variants_option_sig\` (\`product_id\`, \`option_signature\`),
        KEY \`idx_variants_product\` (\`product_id\`, \`position\`, \`is_active\`),
        CONSTRAINT \`fk_variants_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_variants_price\` CHECK (\`price_minor\` >= 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_media\` (
        \`id\`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`     BIGINT UNSIGNED NOT NULL,
        \`product_id\`    BIGINT UNSIGNED NOT NULL,
        \`variant_id\`    BIGINT UNSIGNED NULL,
        \`type\`          VARCHAR(16)     NOT NULL DEFAULT 'IMAGE',
        \`url\`           VARCHAR(1000)   NOT NULL,
        \`storage_key\`   VARCHAR(500)    NOT NULL,
        \`thumbnail_url\` VARCHAR(1000)   NULL,
        \`alt_text\`      VARCHAR(255)    NULL,
        \`mime_type\`     VARCHAR(100)    NULL,
        \`size_bytes\`    BIGINT UNSIGNED NULL,
        \`width\`         INT UNSIGNED    NULL,
        \`height\`        INT UNSIGNED    NULL,
        \`duration_sec\`  INT UNSIGNED    NULL,
        \`position\`      SMALLINT        NOT NULL DEFAULT 0,
        \`is_primary\`    TINYINT(1)      NOT NULL DEFAULT 0,
        \`status\`        VARCHAR(16)     NOT NULL DEFAULT 'PENDING',
        \`created_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_product_media_product\` (\`product_id\`, \`position\`),
        KEY \`idx_product_media_variant\` (\`variant_id\`),
        CONSTRAINT \`fk_product_media_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_product_media_variant\` FOREIGN KEY (\`variant_id\`) REFERENCES \`product_variants\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`chk_product_media_type\` CHECK (\`type\` IN ('IMAGE','VIDEO','MODEL_3D','DOCUMENT')),
        CONSTRAINT \`chk_product_media_status\` CHECK (\`status\` IN ('PENDING','READY','FAILED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_categories\` (
        \`tenant_id\`   BIGINT UNSIGNED NOT NULL,
        \`product_id\`  BIGINT UNSIGNED NOT NULL,
        \`category_id\` BIGINT UNSIGNED NOT NULL,
        \`is_primary\`  TINYINT(1)      NOT NULL DEFAULT 0,
        PRIMARY KEY (\`product_id\`, \`category_id\`),
        KEY \`idx_product_categories_category\` (\`tenant_id\`, \`category_id\`),
        CONSTRAINT \`fk_product_categories_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_product_categories_category\` FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_attributes\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`        BIGINT UNSIGNED NOT NULL,
        \`public_id\`        CHAR(26)        NOT NULL,
        \`code\`             VARCHAR(64)     NOT NULL,
        \`name\`             VARCHAR(120)    NOT NULL,
        \`input_type\`       VARCHAR(32)     NOT NULL DEFAULT 'SELECT',
        \`is_variant_option\` TINYINT(1)     NOT NULL DEFAULT 0,
        \`is_filterable\`    TINYINT(1)      NOT NULL DEFAULT 1,
        \`sort_order\`       SMALLINT        NOT NULL DEFAULT 0,
        \`created_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_product_attributes_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_product_attributes_tenant_code\` (\`tenant_id\`, \`code\`),
        CONSTRAINT \`fk_product_attributes_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_attribute_values\` (
        \`id\`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`    BIGINT UNSIGNED NOT NULL,
        \`product_id\`   BIGINT UNSIGNED NOT NULL,
        \`attribute_id\` BIGINT UNSIGNED NOT NULL,
        \`value_text\`   VARCHAR(500)    NULL,
        \`value_number\` DECIMAL(18,4)   NULL,
        \`value_bool\`   TINYINT(1)      NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_pav_facet\` (\`tenant_id\`, \`attribute_id\`, \`value_text\`(100), \`product_id\`),
        KEY \`idx_pav_product\` (\`product_id\`),
        CONSTRAINT \`fk_pav_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_pav_attribute\` FOREIGN KEY (\`attribute_id\`) REFERENCES \`product_attributes\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `product_attribute_values`');
    await queryRunner.query('DROP TABLE IF EXISTS `product_attributes`');
    await queryRunner.query('DROP TABLE IF EXISTS `product_categories`');
    await queryRunner.query('DROP TABLE IF EXISTS `product_media`');
    await queryRunner.query('DROP TABLE IF EXISTS `product_variants`');
    await queryRunner.query('DROP TABLE IF EXISTS `products`');
    await queryRunner.query('DROP TABLE IF EXISTS `tax_rates`');
    await queryRunner.query('DROP TABLE IF EXISTS `tax_classes`');
    await queryRunner.query('DROP TABLE IF EXISTS `categories`');
    await queryRunner.query('DROP TABLE IF EXISTS `brands`');
  }
}
