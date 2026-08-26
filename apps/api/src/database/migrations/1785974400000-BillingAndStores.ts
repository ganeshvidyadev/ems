import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3: plans, subscriptions, invoices, stores, warehouses, provisioning.
 *
 * Two deviations from docs/02, both required:
 *
 *  1. **Column ordering.** The doc declares `subscriptions.active_guard` *after* the
 *     PRIMARY KEY clause. MySQL requires every column definition before any key
 *     definition, so the DDL as written would not parse. Reordered here.
 *
 *  2. **`provisioning_tasks` is new.** The doc's `tenants.provisioning_step` is a single
 *     cursor, which cannot express "step 4 failed with this error, steps 1–3 succeeded,
 *     step 4 is retryable". A resumable saga needs per-step rows, and the merchant-facing
 *     wizard needs per-step status to avoid the "your store is being created" dead end the
 *     architecture doc calls out as the biggest support-volume driver in this product
 *     category.
 */
export class BillingAndStores1785974400000 implements MigrationInterface {
  name = 'BillingAndStores1785974400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------------
    // plans / plan_limits
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`plans\` (
        \`id\`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`code\`                VARCHAR(64)  NOT NULL,
        \`name\`                VARCHAR(100) NOT NULL,
        \`description\`         TEXT         NULL,
        \`price_monthly_minor\` BIGINT       NOT NULL DEFAULT 0,
        \`price_yearly_minor\`  BIGINT       NOT NULL DEFAULT 0,
        \`currency\`            CHAR(3)      NOT NULL DEFAULT 'INR',
        \`trial_days\`          SMALLINT UNSIGNED NOT NULL DEFAULT 14,
        -- 0 marks a negotiated plan: hidden from the public pricing page but assignable
        -- by a platform admin.
        \`is_public\`           TINYINT(1)   NOT NULL DEFAULT 1,
        \`sort_order\`          SMALLINT     NOT NULL DEFAULT 0,
        -- Display bullets only. Gating reads plan_limits — never this column.
        \`features\`            JSON         NULL,
        \`status\`              VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
        \`created_at\`          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_plans_code\` (\`code\`),
        KEY \`idx_plans_public\` (\`is_public\`, \`status\`, \`sort_order\`),
        CONSTRAINT \`chk_plans_status\` CHECK (\`status\` IN ('ACTIVE','ARCHIVED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Quotas as ROWS, not a JSON blob: the guard reads one key on a write path, and
    // "which tenants are near their product cap" stays an indexed query instead of a
    // full scan that unpacks JSON per tenant.
    await queryRunner.query(`
      CREATE TABLE \`plan_limits\` (
        \`id\`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`plan_id\`     INT UNSIGNED NOT NULL,
        \`limit_key\`   VARCHAR(64)  NOT NULL,
        -- -1 means unlimited. NULL would be ambiguous with "not configured".
        \`limit_value\` BIGINT       NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_plan_limits_plan_key\` (\`plan_id\`, \`limit_key\`),
        CONSTRAINT \`fk_plan_limits_plan\` FOREIGN KEY (\`plan_id\`)
          REFERENCES \`plans\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // -----------------------------------------------------------------------
    // subscriptions
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`subscriptions\` (
        \`id\`                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`public_id\`               CHAR(26)        NOT NULL,
        \`tenant_id\`               BIGINT UNSIGNED NOT NULL,
        \`plan_id\`                 INT UNSIGNED    NOT NULL,
        \`billing_cycle\`           VARCHAR(16)     NOT NULL,
        \`status\`                  VARCHAR(32)     NOT NULL,
        -- Price snapshot. A later plan price change must not retro-alter what an existing
        -- subscriber pays, and a merchant seeing their bill change without notice is a
        -- chargeback waiting to happen.
        \`unit_amount_minor\`       BIGINT          NOT NULL,
        \`currency\`                CHAR(3)         NOT NULL,
        \`quantity\`                INT UNSIGNED    NOT NULL DEFAULT 1,
        \`trial_start\`             DATETIME(3)     NULL,
        \`trial_end\`               DATETIME(3)     NULL,
        \`current_period_start\`    DATETIME(3)     NOT NULL,
        \`current_period_end\`      DATETIME(3)     NOT NULL,
        \`cancel_at_period_end\`    TINYINT(1)      NOT NULL DEFAULT 0,
        \`cancelled_at\`            DATETIME(3)     NULL,
        \`ended_at\`                DATETIME(3)     NULL,
        \`auto_renew\`              TINYINT(1)      NOT NULL DEFAULT 1,
        \`gateway\`                 VARCHAR(32)     NULL,
        \`gateway_subscription_id\` VARCHAR(191)    NULL,
        \`gateway_customer_id\`     VARCHAR(191)    NULL,
        \`payment_method_id\`       BIGINT UNSIGNED NULL,
        \`dunning_attempts\`        TINYINT UNSIGNED NOT NULL DEFAULT 0,
        \`grace_period_ends_at\`    DATETIME(3)     NULL,
        \`version\`                 INT UNSIGNED    NOT NULL DEFAULT 0,
        \`created_at\`              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        /*
         * Conditional unique constraint, MySQL-style.
         *
         * Evaluates to 1 for live statuses and NULL otherwise. MySQL ignores NULLs in a
         * UNIQUE key, so this permits many terminated subscriptions per tenant but only
         * one live one — making "a tenant cannot hold two live subscriptions" a *database*
         * invariant. Enforced only in a service, a double-clicked upgrade during a race
         * bills the merchant twice.
         */
        \`active_guard\` TINYINT(1) GENERATED ALWAYS AS
          (CASE WHEN \`status\` IN ('TRIALING','ACTIVE','PAST_DUE') THEN 1 ELSE NULL END) STORED,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_subscriptions_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_subscriptions_one_active\` (\`tenant_id\`, \`active_guard\`),
        KEY \`idx_subscriptions_renewal\` (\`status\`, \`current_period_end\`),
        KEY \`idx_subscriptions_gateway\` (\`gateway\`, \`gateway_subscription_id\`),
        -- RESTRICT, not CASCADE: tenant_id feeds the generated active_guard column, and
        -- MySQL forbids CASCADE on such a column. Deleting a tenant with billing history
        -- should be deliberate anyway.
        CONSTRAINT \`fk_subscriptions_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_subscriptions_plan\` FOREIGN KEY (\`plan_id\`)
          REFERENCES \`plans\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_subscriptions_cycle\` CHECK (\`billing_cycle\` IN ('MONTHLY','YEARLY')),
        CONSTRAINT \`chk_subscriptions_status\` CHECK (\`status\` IN
          ('TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCELLED','EXPIRED')),
        CONSTRAINT \`chk_subscriptions_period\` CHECK (\`current_period_end\` > \`current_period_start\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // -----------------------------------------------------------------------
    // subscription_invoices / subscription_payments
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`subscription_invoices\` (
        \`id\`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`public_id\`         CHAR(26)        NOT NULL,
        \`tenant_id\`         BIGINT UNSIGNED NOT NULL,
        \`subscription_id\`   BIGINT UNSIGNED NOT NULL,
        -- Gapless per tenant. A missing number in a tax-invoice series is a compliance
        -- problem in most jurisdictions, which is why numbering is allocated under a row
        -- lock rather than from AUTO_INCREMENT (which skips on rollback).
        \`invoice_number\`    VARCHAR(64)     NOT NULL,
        \`status\`            VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
        \`subtotal_minor\`    BIGINT          NOT NULL DEFAULT 0,
        \`discount_minor\`    BIGINT          NOT NULL DEFAULT 0,
        \`tax_minor\`         BIGINT          NOT NULL DEFAULT 0,
        \`total_minor\`       BIGINT          NOT NULL DEFAULT 0,
        \`amount_paid_minor\` BIGINT          NOT NULL DEFAULT 0,
        \`amount_due_minor\`  BIGINT          NOT NULL DEFAULT 0,
        \`currency\`          CHAR(3)         NOT NULL,
        \`period_start\`      DATETIME(3)     NOT NULL,
        \`period_end\`        DATETIME(3)     NOT NULL,
        \`due_at\`            DATETIME(3)     NULL,
        \`paid_at\`           DATETIME(3)     NULL,
        \`voided_at\`         DATETIME(3)     NULL,
        -- Immutable snapshot of what was billed. Recomputing an old invoice from current
        -- plan prices would silently rewrite history.
        \`line_items\`        JSON            NOT NULL,
        \`billing_address\`   JSON            NULL,
        \`pdf_url\`           VARCHAR(500)    NULL,
        \`created_at\`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_sub_invoices_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_sub_invoices_tenant_number\` (\`tenant_id\`, \`invoice_number\`),
        KEY \`idx_sub_invoices_subscription\` (\`subscription_id\`, \`created_at\`),
        KEY \`idx_sub_invoices_status_due\` (\`status\`, \`due_at\`),
        CONSTRAINT \`fk_sub_invoices_subscription\` FOREIGN KEY (\`subscription_id\`)
          REFERENCES \`subscriptions\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_sub_invoices_status\` CHECK (\`status\` IN
          ('DRAFT','OPEN','PAID','PARTIALLY_PAID','UNCOLLECTIBLE','VOID','REFUNDED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Per-tenant invoice number allocator.
    //
    // A dedicated counter table, incremented under a row lock, because AUTO_INCREMENT
    // gaps on any rolled-back transaction and gaps break the gapless requirement.
    await queryRunner.query(`
      CREATE TABLE \`invoice_sequences\` (
        \`tenant_id\`   BIGINT UNSIGNED NOT NULL,
        \`series\`      VARCHAR(32)     NOT NULL DEFAULT 'SUB',
        \`fiscal_year\` SMALLINT UNSIGNED NOT NULL,
        \`last_number\` BIGINT UNSIGNED NOT NULL DEFAULT 0,
        \`updated_at\`  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`tenant_id\`, \`series\`, \`fiscal_year\`),
        CONSTRAINT \`fk_invoice_sequences_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`subscription_payments\` (
        \`id\`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`public_id\`          CHAR(26)        NOT NULL,
        \`tenant_id\`          BIGINT UNSIGNED NOT NULL,
        \`subscription_id\`    BIGINT UNSIGNED NULL,
        \`invoice_id\`         BIGINT UNSIGNED NULL,
        \`gateway\`            VARCHAR(32)     NOT NULL,
        \`gateway_order_id\`   VARCHAR(191)    NULL,
        \`gateway_payment_id\` VARCHAR(191)    NULL,
        \`status\`             VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`amount_minor\`       BIGINT          NOT NULL,
        \`currency\`           CHAR(3)         NOT NULL,
        \`method\`             VARCHAR(32)     NULL,
        \`failure_code\`       VARCHAR(64)     NULL,
        \`failure_message\`    VARCHAR(500)    NULL,
        -- Raw gateway response, retained for dispute evidence. Redacted of card data by
        -- the adapter before it reaches here — a PAN must never enter our schema (SAQ-A).
        \`gateway_payload\`    JSON            NULL,
        -- Client-supplied key making a double-clicked Pay button a single charge.
        \`idempotency_key\`    VARCHAR(128)    NULL,
        \`captured_at\`        DATETIME(3)     NULL,
        \`failed_at\`          DATETIME(3)     NULL,
        \`created_at\`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_sub_payments_public_id\` (\`public_id\`),
        -- A gateway payment id must map to exactly one row, so a replayed webhook cannot
        -- record a second capture for the same money.
        UNIQUE KEY \`uq_sub_payments_gateway_payment\` (\`gateway\`, \`gateway_payment_id\`),
        UNIQUE KEY \`uq_sub_payments_idempotency\` (\`tenant_id\`, \`idempotency_key\`),
        KEY \`idx_sub_payments_invoice\` (\`invoice_id\`, \`status\`),
        KEY \`idx_sub_payments_reconcile\` (\`status\`, \`created_at\`),
        CONSTRAINT \`fk_sub_payments_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_sub_payments_status\` CHECK (\`status\` IN
          ('PENDING','AUTHORIZED','CAPTURED','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // -----------------------------------------------------------------------
    // stores / store_settings / warehouses
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`stores\` (
        \`id\`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`         BIGINT UNSIGNED NOT NULL,
        \`public_id\`         CHAR(26)        NOT NULL,
        \`name\`              VARCHAR(255)    NOT NULL,
        \`slug\`              VARCHAR(120)    NOT NULL,
        \`status\`            VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
        \`currency\`          CHAR(3)         NOT NULL DEFAULT 'INR',
        \`locale\`            VARCHAR(10)     NOT NULL DEFAULT 'en-IN',
        \`timezone\`          VARCHAR(64)     NOT NULL DEFAULT 'Asia/Kolkata',
        \`weight_unit\`       VARCHAR(8)      NOT NULL DEFAULT 'kg',
        \`dimension_unit\`    VARCHAR(8)      NOT NULL DEFAULT 'cm',
        \`active_theme_id\`   BIGINT UNSIGNED NULL,
        \`logo_url\`          VARCHAR(500)    NULL,
        \`favicon_url\`       VARCHAR(500)    NULL,
        \`support_email\`     VARCHAR(255)    NULL,
        \`support_phone\`     VARCHAR(32)     NULL,
        \`business_address\`  JSON            NULL,
        \`is_marketplace_supplier\` TINYINT(1) NOT NULL DEFAULT 0,
        \`is_marketplace_reseller\` TINYINT(1) NOT NULL DEFAULT 0,
        \`created_at\`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`        DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_stores_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_stores_tenant_slug\` (\`tenant_id\`, \`slug\`),
        KEY \`idx_stores_tenant_status\` (\`tenant_id\`, \`status\`),
        CONSTRAINT \`fk_stores_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_stores_status\` CHECK (\`status\` IN ('DRAFT','ACTIVE','MAINTENANCE','CLOSED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Key/value rather than a 90-column table: a new setting ships without a migration,
    // and `setting_group` lets one settings screen load in one query.
    await queryRunner.query(`
      CREATE TABLE \`store_settings\` (
        \`id\`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`     BIGINT UNSIGNED NOT NULL,
        \`store_id\`      BIGINT UNSIGNED NOT NULL,
        \`setting_group\` VARCHAR(64)     NOT NULL,
        \`setting_key\`   VARCHAR(120)    NOT NULL,
        \`setting_value\` JSON            NULL,
        -- Gateway secrets are AES-256-GCM at rest; the flag tells the reader to decrypt.
        \`is_encrypted\`  TINYINT(1)      NOT NULL DEFAULT 0,
        \`updated_by\`    BIGINT UNSIGNED NULL,
        \`created_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_store_settings\` (\`tenant_id\`, \`store_id\`, \`setting_group\`, \`setting_key\`),
        KEY \`idx_store_settings_group\` (\`tenant_id\`, \`store_id\`, \`setting_group\`),
        CONSTRAINT \`fk_store_settings_store\` FOREIGN KEY (\`store_id\`)
          REFERENCES \`stores\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`warehouses\` (
        \`id\`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`     BIGINT UNSIGNED NOT NULL,
        \`store_id\`      BIGINT UNSIGNED NULL,
        \`public_id\`     CHAR(26)        NOT NULL,
        \`code\`          VARCHAR(64)     NOT NULL,
        \`name\`          VARCHAR(255)    NOT NULL,
        \`type\`          VARCHAR(32)     NOT NULL DEFAULT 'WAREHOUSE',
        \`address_line1\` VARCHAR(255)    NULL,
        \`address_line2\` VARCHAR(255)    NULL,
        \`city\`          VARCHAR(120)    NULL,
        \`state_code\`    VARCHAR(10)     NULL,
        \`postal_code\`   VARCHAR(20)     NULL,
        \`country_code\`  CHAR(2)         NOT NULL DEFAULT 'IN',
        \`latitude\`      DECIMAL(10,7)   NULL,
        \`longitude\`     DECIMAL(10,7)   NULL,
        -- Fulfilment allocation order when several warehouses can serve an order.
        \`priority\`      SMALLINT        NOT NULL DEFAULT 0,
        \`is_default\`    TINYINT(1)      NOT NULL DEFAULT 0,
        \`is_active\`     TINYINT(1)      NOT NULL DEFAULT 1,
        \`created_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`    DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_warehouses_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_warehouses_tenant_code\` (\`tenant_id\`, \`code\`),
        KEY \`idx_warehouses_tenant_active\` (\`tenant_id\`, \`is_active\`, \`priority\`),
        CONSTRAINT \`fk_warehouses_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_warehouses_type\` CHECK (\`type\` IN
          ('WAREHOUSE','STORE','DROPSHIP','VIRTUAL'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // -----------------------------------------------------------------------
    // provisioning_tasks — the resumable saga's state
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`provisioning_tasks\` (
        \`id\`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`     BIGINT UNSIGNED NOT NULL,
        \`step\`          VARCHAR(64)     NOT NULL,
        \`sequence\`      SMALLINT UNSIGNED NOT NULL,
        \`status\`        VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`attempts\`      TINYINT UNSIGNED NOT NULL DEFAULT 0,
        -- Whether a failure is worth retrying. A DNS timeout is; "slug already taken" is
        -- not, and retrying it forever would hide the real problem from the merchant.
        \`retryable\`     TINYINT(1)      NOT NULL DEFAULT 1,
        \`error_message\` VARCHAR(1000)   NULL,
        -- Ids of things the step created, so a retry can detect its own prior work instead
        -- of creating a second DNS record or a duplicate store.
        \`result\`        JSON            NULL,
        \`started_at\`    DATETIME(3)     NULL,
        \`finished_at\`   DATETIME(3)     NULL,
        \`created_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        -- One row per (tenant, step). This IS the idempotency mechanism: the saga claims a
        -- step with a conditional UPDATE, so a re-delivered job cannot re-run a completed
        -- step.
        UNIQUE KEY \`uq_provisioning_tenant_step\` (\`tenant_id\`, \`step\`),
        KEY \`idx_provisioning_tenant_seq\` (\`tenant_id\`, \`sequence\`),
        KEY \`idx_provisioning_status\` (\`status\`, \`updated_at\`),
        CONSTRAINT \`fk_provisioning_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_provisioning_status\` CHECK (\`status\` IN
          ('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Links a tenant to its current subscription for cheap reads on the request path.
    // Nullable and FK'd with SET NULL so deleting a subscription cannot orphan a tenant.
    await queryRunner.query(`
      ALTER TABLE \`tenants\`
        ADD COLUMN \`current_subscription_id\` BIGINT UNSIGNED NULL AFTER \`owner_user_id\`,
        ADD CONSTRAINT \`fk_tenants_subscription\` FOREIGN KEY (\`current_subscription_id\`)
          REFERENCES \`subscriptions\` (\`id\`) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tenants\` DROP FOREIGN KEY \`fk_tenants_subscription\``,
    );
    await queryRunner.query(`ALTER TABLE \`tenants\` DROP COLUMN \`current_subscription_id\``);
    await queryRunner.query(`DROP TABLE \`provisioning_tasks\``);
    await queryRunner.query(`DROP TABLE \`warehouses\``);
    await queryRunner.query(`DROP TABLE \`store_settings\``);
    await queryRunner.query(`DROP TABLE \`stores\``);
    await queryRunner.query(`DROP TABLE \`subscription_payments\``);
    await queryRunner.query(`DROP TABLE \`invoice_sequences\``);
    await queryRunner.query(`DROP TABLE \`subscription_invoices\``);
    await queryRunner.query(`DROP TABLE \`subscriptions\``);
    await queryRunner.query(`DROP TABLE \`plan_limits\``);
    await queryRunner.query(`DROP TABLE \`plans\``);
  }
}
