import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7: theme templates, tenant themes, CMS pages, blog posts, banners,
 * menus and menu items.
 *
 * DDL matches docs/02-data-model.md §15 verbatim, with one addition: a
 * `UNIQUE KEY` on `cms_pages.public_id` and `blog_posts.public_id`. The doc's
 * own DDL declares the column on both but — same gap `Catalog`'s migration
 * comment already found and fixed for `tax_classes`/`tax_rates` — omits the
 * uniqueness constraint, which every other individually-addressable,
 * tenant-owned table in the schema carries.
 */
export class ThemingAndContent1786800000000 implements MigrationInterface {
  name = 'ThemingAndContent1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`theme_templates\` (
        \`id\`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`code\`           VARCHAR(64)  NOT NULL,
        \`name\`           VARCHAR(120) NOT NULL,
        \`category\`       VARCHAR(64)  NOT NULL,
        \`description\`    TEXT         NULL,
        \`preview_url\`    VARCHAR(500) NULL,
        \`thumbnail_url\`  VARCHAR(500) NULL,
        \`demo_url\`       VARCHAR(500) NULL,
        \`is_premium\`     TINYINT(1)   NOT NULL DEFAULT 0,
        \`price_minor\`    BIGINT       NOT NULL DEFAULT 0,
        \`min_plan_id\`    INT UNSIGNED NULL,
        \`default_config\` JSON         NOT NULL,
        \`schema_version\` SMALLINT     NOT NULL DEFAULT 1,
        \`status\`         VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
        \`created_at\`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_theme_templates_code\` (\`code\`),
        KEY \`idx_theme_templates_category\` (\`category\`, \`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`tenant_themes\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`        BIGINT UNSIGNED NOT NULL,
        \`store_id\`         BIGINT UNSIGNED NOT NULL,
        \`template_id\`      INT UNSIGNED    NOT NULL,
        \`public_id\`        CHAR(26)        NOT NULL,
        \`name\`             VARCHAR(120)    NOT NULL,
        \`config\`           JSON            NOT NULL,
        \`custom_css\`       MEDIUMTEXT      NULL,
        \`custom_head_html\` TEXT            NULL,
        \`status\`           VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
        \`published_at\`     DATETIME(3)     NULL,
        \`published_config\` JSON            NULL,
        \`version\`          INT UNSIGNED    NOT NULL DEFAULT 0,
        \`created_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_tenant_themes_public_id\` (\`public_id\`),
        KEY \`idx_tenant_themes_store\` (\`tenant_id\`, \`store_id\`, \`status\`),
        CONSTRAINT \`fk_tenant_themes_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_tenant_themes_template\` FOREIGN KEY (\`template_id\`) REFERENCES \`theme_templates\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`cms_pages\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`        BIGINT UNSIGNED NOT NULL,
        \`store_id\`         BIGINT UNSIGNED NOT NULL,
        \`public_id\`        CHAR(26)        NOT NULL,
        \`slug\`             VARCHAR(255)    NOT NULL,
        \`title\`            VARCHAR(255)    NOT NULL,
        \`content_html\`     MEDIUMTEXT      NULL,
        \`content_blocks\`   JSON            NULL,
        \`template\`         VARCHAR(64)     NULL,
        \`status\`           VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
        \`is_system\`        TINYINT(1)      NOT NULL DEFAULT 0,
        \`meta_title\`       VARCHAR(255)    NULL,
        \`meta_description\` VARCHAR(500)    NULL,
        \`canonical_url\`    VARCHAR(500)    NULL,
        \`no_index\`         TINYINT(1)      NOT NULL DEFAULT 0,
        \`published_at\`     DATETIME(3)     NULL,
        \`created_by\`       BIGINT UNSIGNED NULL,
        \`created_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`       DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_cms_pages_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_cms_pages_store_slug\` (\`tenant_id\`, \`store_id\`, \`slug\`),
        KEY \`idx_cms_pages_status\` (\`tenant_id\`, \`store_id\`, \`status\`),
        CONSTRAINT \`fk_cms_pages_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`blog_posts\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`        BIGINT UNSIGNED NOT NULL,
        \`store_id\`         BIGINT UNSIGNED NOT NULL,
        \`public_id\`        CHAR(26)        NOT NULL,
        \`slug\`             VARCHAR(255)    NOT NULL,
        \`title\`            VARCHAR(255)    NOT NULL,
        \`excerpt\`          VARCHAR(1000)   NULL,
        \`content_html\`     MEDIUMTEXT      NULL,
        \`cover_image_url\`  VARCHAR(1000)   NULL,
        \`author_id\`        BIGINT UNSIGNED NULL,
        \`author_name\`      VARCHAR(120)    NULL,
        \`category\`         VARCHAR(120)    NULL,
        \`tags\`             JSON            NULL,
        \`status\`           VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
        \`view_count\`       INT UNSIGNED    NOT NULL DEFAULT 0,
        \`meta_title\`       VARCHAR(255)    NULL,
        \`meta_description\` VARCHAR(500)    NULL,
        \`published_at\`     DATETIME(3)     NULL,
        \`created_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`       DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_blog_posts_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_blog_posts_store_slug\` (\`tenant_id\`, \`store_id\`, \`slug\`),
        KEY \`idx_blog_posts_published\` (\`tenant_id\`, \`store_id\`, \`status\`, \`published_at\`),
        FULLTEXT KEY \`ft_blog_posts\` (\`title\`, \`excerpt\`),
        CONSTRAINT \`fk_blog_posts_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`banners\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`        BIGINT UNSIGNED NOT NULL,
        \`store_id\`         BIGINT UNSIGNED NOT NULL,
        \`placement\`        VARCHAR(64)     NOT NULL,
        \`title\`            VARCHAR(255)    NULL,
        \`subtitle\`         VARCHAR(500)    NULL,
        \`image_url\`        VARCHAR(1000)   NULL,
        \`mobile_image_url\` VARCHAR(1000)   NULL,
        \`alt_text\`         VARCHAR(255)    NULL,
        \`link_url\`         VARCHAR(1000)   NULL,
        \`cta_label\`        VARCHAR(64)     NULL,
        \`sort_order\`       SMALLINT        NOT NULL DEFAULT 0,
        \`starts_at\`        DATETIME(3)     NULL,
        \`ends_at\`          DATETIME(3)     NULL,
        \`is_active\`        TINYINT(1)      NOT NULL DEFAULT 1,
        \`click_count\`      INT UNSIGNED    NOT NULL DEFAULT 0,
        \`created_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_banners_placement\` (\`tenant_id\`, \`store_id\`, \`placement\`, \`is_active\`, \`sort_order\`),
        CONSTRAINT \`fk_banners_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`menus\` (
        \`id\`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`  BIGINT UNSIGNED NOT NULL,
        \`store_id\`   BIGINT UNSIGNED NOT NULL,
        \`code\`       VARCHAR(64)     NOT NULL,
        \`name\`       VARCHAR(120)    NOT NULL,
        \`created_at\` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_menus_store_code\` (\`tenant_id\`, \`store_id\`, \`code\`),
        CONSTRAINT \`fk_menus_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`menu_items\` (
        \`id\`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`       BIGINT UNSIGNED NOT NULL,
        \`menu_id\`         BIGINT UNSIGNED NOT NULL,
        \`parent_id\`       BIGINT UNSIGNED NULL,
        \`label\`           VARCHAR(120)    NOT NULL,
        \`link_type\`       VARCHAR(32)     NOT NULL,
        \`link_target\`     VARCHAR(500)    NULL,
        \`reference_id\`    BIGINT UNSIGNED NULL,
        \`icon\`            VARCHAR(64)     NULL,
        \`open_in_new_tab\` TINYINT(1)      NOT NULL DEFAULT 0,
        \`sort_order\`      SMALLINT        NOT NULL DEFAULT 0,
        \`is_active\`       TINYINT(1)      NOT NULL DEFAULT 1,
        PRIMARY KEY (\`id\`),
        KEY \`idx_menu_items_menu\` (\`menu_id\`, \`parent_id\`, \`sort_order\`),
        CONSTRAINT \`fk_menu_items_menu\` FOREIGN KEY (\`menu_id\`) REFERENCES \`menus\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_menu_items_parent\` FOREIGN KEY (\`parent_id\`) REFERENCES \`menu_items\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `menu_items`');
    await queryRunner.query('DROP TABLE IF EXISTS `menus`');
    await queryRunner.query('DROP TABLE IF EXISTS `banners`');
    await queryRunner.query('DROP TABLE IF EXISTS `blog_posts`');
    await queryRunner.query('DROP TABLE IF EXISTS `cms_pages`');
    await queryRunner.query('DROP TABLE IF EXISTS `tenant_themes`');
    await queryRunner.query('DROP TABLE IF EXISTS `theme_templates`');
  }
}
