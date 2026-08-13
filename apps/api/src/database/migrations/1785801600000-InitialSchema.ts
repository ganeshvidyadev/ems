import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 foundation schema (docs/02-data-model.md §3, §4, §19).
 *
 * Written as explicit SQL rather than generated from entity metadata. TypeORM's
 * generator cannot express the things this schema depends on for correctness:
 * `CHECK` constraints, `STORED` generated columns used as partial-index
 * substitutes, and `RANGE` partitioning. Hand-written DDL also means the
 * migration is reviewable as the artifact that actually runs.
 *
 * Two deviations from the design doc, both correctness fixes:
 *
 *  1. `users` uniqueness. The doc paired `UNIQUE (tenant_id, email_normalized)`
 *     with `UNIQUE (user_type, email_normalized)`. The second key would have made
 *     every TENANT email globally unique, contradicting the doc's own stated
 *     intent that one person may hold accounts at two different stores. Replaced
 *     with a single key over a generated `tenant_scope` column (`IFNULL(tenant_id,0)`),
 *     which dedupes platform users by email *and* tenant users per tenant.
 *
 *  2. `user_roles` / `roles` keys. The doc used a functional key part
 *     (`PRIMARY KEY (..., (IFNULL(store_id, 0)))`). MySQL forbids functional key
 *     parts in a PRIMARY KEY, and NULL-distinctness would otherwise let the same
 *     grant be inserted repeatedly. Both now use a `STORED` generated scope column
 *     inside a real unique key.
 */
export class InitialSchema1785801600000 implements MigrationInterface {
  name = 'InitialSchema1785801600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------------
    // tenants — the registry every tenant-scoped table points at.
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`tenants\` (
        \`id\`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`public_id\`         CHAR(26)        NOT NULL,
        \`slug\`              VARCHAR(63)     NOT NULL,
        \`business_name\`     VARCHAR(255)    NOT NULL,
        \`legal_name\`        VARCHAR(255)    NULL,
        \`owner_user_id\`     BIGINT UNSIGNED NULL,
        \`status\`            VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`provisioning_step\` VARCHAR(64)     NULL,
        \`country_code\`      CHAR(2)         NOT NULL DEFAULT 'IN',
        \`default_currency\`  CHAR(3)         NOT NULL DEFAULT 'INR',
        \`default_locale\`    VARCHAR(10)     NOT NULL DEFAULT 'en-IN',
        \`timezone\`          VARCHAR(64)     NOT NULL DEFAULT 'Asia/Kolkata',
        \`tax_registration\`  VARCHAR(64)     NULL,
        \`contact_email\`     VARCHAR(255)    NOT NULL,
        \`contact_phone\`     VARCHAR(32)     NULL,
        \`trial_ends_at\`     DATETIME(3)     NULL,
        \`suspended_at\`      DATETIME(3)     NULL,
        \`suspension_reason\` VARCHAR(255)    NULL,
        \`onboarding_state\`  JSON            NULL,
        \`version\`           INT UNSIGNED    NOT NULL DEFAULT 0,
        \`created_at\`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`        DATETIME(3)     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_tenants_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_tenants_slug\` (\`slug\`),
        KEY \`idx_tenants_status\` (\`status\`),
        KEY \`idx_tenants_trial_ends\` (\`trial_ends_at\`),
        CONSTRAINT \`chk_tenants_status\` CHECK (\`status\` IN
          ('PENDING','PROVISIONING','ACTIVE','TRIAL','PAST_DUE','SUSPENDED','CANCELLED','DELETED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // -----------------------------------------------------------------------
    // tenant_domains — host → tenant routing. Read on every storefront request.
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`tenant_domains\` (
        \`id\`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`           BIGINT UNSIGNED NOT NULL,
        \`store_id\`            BIGINT UNSIGNED NULL,
        \`hostname\`            VARCHAR(253)    NOT NULL,
        \`type\`                VARCHAR(32)     NOT NULL,
        \`is_primary\`          TINYINT(1)      NOT NULL DEFAULT 0,
        \`verification_token\`  VARCHAR(64)     NULL,
        \`verification_method\` VARCHAR(32)     NULL,
        \`verified_at\`         DATETIME(3)     NULL,
        \`ssl_status\`          VARCHAR(32)     NOT NULL DEFAULT 'NONE',
        \`ssl_issued_at\`       DATETIME(3)     NULL,
        \`ssl_expires_at\`      DATETIME(3)     NULL,
        \`last_check_at\`       DATETIME(3)     NULL,
        \`check_attempts\`      INT UNSIGNED    NOT NULL DEFAULT 0,
        \`last_error\`          VARCHAR(500)    NULL,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        -- Globally unique, not per-tenant: a hostname is the platform's routing
        -- key, so two tenants claiming it would make routing ambiguous.
        UNIQUE KEY \`uq_tenant_domains_hostname\` (\`hostname\`),
        KEY \`idx_tenant_domains_tenant\` (\`tenant_id\`, \`is_primary\`),
        -- Drives the cert-renewal cron; without it renewal becomes a full scan.
        KEY \`idx_tenant_domains_ssl_expiry\` (\`ssl_status\`, \`ssl_expires_at\`),
        CONSTRAINT \`fk_tenant_domains_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_tenant_domains_type\` CHECK (\`type\` IN ('SUBDOMAIN','CUSTOM')),
        CONSTRAINT \`chk_tenant_domains_ssl\` CHECK (\`ssl_status\` IN
          ('NONE','PENDING','ISSUING','ACTIVE','FAILED','EXPIRED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // -----------------------------------------------------------------------
    // users — platform staff and tenant users in one table (docs/02 §4).
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`users\` (
        \`id\`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`public_id\`             CHAR(26)        NOT NULL,
        \`tenant_id\`             BIGINT UNSIGNED NULL,
        \`user_type\`             VARCHAR(32)     NOT NULL DEFAULT 'TENANT',
        \`email\`                 VARCHAR(255)    NOT NULL,
        \`email_normalized\`      VARCHAR(255)    NOT NULL,
        \`phone_e164\`            VARCHAR(20)     NULL,
        \`password_hash\`         VARCHAR(255)    NULL,
        \`password_algo\`         VARCHAR(16)     NOT NULL DEFAULT 'bcrypt',
        \`password_changed_at\`   DATETIME(3)     NULL,
        \`first_name\`            VARCHAR(100)    NOT NULL,
        \`last_name\`             VARCHAR(100)    NULL,
        \`avatar_url\`            VARCHAR(500)    NULL,
        \`status\`                VARCHAR(32)     NOT NULL DEFAULT 'PENDING_VERIFICATION',
        \`email_verified_at\`     DATETIME(3)     NULL,
        \`phone_verified_at\`     DATETIME(3)     NULL,
        \`mfa_enabled\`           TINYINT(1)      NOT NULL DEFAULT 0,
        \`mfa_secret_encrypted\`  VARBINARY(512)  NULL,
        \`mfa_recovery_codes\`    JSON            NULL,
        \`failed_login_attempts\` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        \`locked_until\`          DATETIME(3)     NULL,
        \`last_login_at\`         DATETIME(3)     NULL,
        \`last_login_ip\`         VARBINARY(16)   NULL,
        \`locale\`                VARCHAR(10)     NULL,
        \`timezone\`              VARCHAR(64)     NULL,
        \`created_at\`            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\`            DATETIME(3)     NULL,
        -- MySQL cannot index \`WHERE deleted_at IS NULL\`; this stored column is
        -- the partial-index substitute and is carried in the hot composite index.
        \`is_live\`               TINYINT(1) GENERATED ALWAYS AS
                                   (CASE WHEN \`deleted_at\` IS NULL THEN 1 ELSE 0 END) STORED,
        -- 0 stands for "the platform", so one unique key covers both cases:
        -- platform users deduped by email, tenant users deduped per tenant.
        \`tenant_scope\`          BIGINT UNSIGNED GENERATED ALWAYS AS
                                   (IFNULL(\`tenant_id\`, 0)) STORED NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_users_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_users_scope_email\` (\`tenant_scope\`, \`email_normalized\`),
        KEY \`idx_users_tenant_status\` (\`tenant_id\`, \`status\`, \`is_live\`),
        KEY \`idx_users_phone\` (\`phone_e164\`),
        KEY \`idx_users_email_normalized\` (\`email_normalized\`),
        CONSTRAINT \`fk_users_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_users_type\` CHECK (\`user_type\` IN ('PLATFORM','TENANT')),
        -- Keeps the nullable tenant_id correlated with user_type, which is the
        -- price of serving both user kinds from one table.
        CONSTRAINT \`chk_users_tenant_correlation\` CHECK (
          (\`user_type\` = 'PLATFORM' AND \`tenant_id\` IS NULL) OR
          (\`user_type\` = 'TENANT'   AND \`tenant_id\` IS NOT NULL)),
        CONSTRAINT \`chk_users_status\` CHECK (\`status\` IN
          ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','LOCKED','DEACTIVATED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // tenants.owner_user_id → users.id, added after both tables exist.
    await queryRunner.query(`
      ALTER TABLE \`tenants\`
        ADD CONSTRAINT \`fk_tenants_owner_user\` FOREIGN KEY (\`owner_user_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
    `);

    // -----------------------------------------------------------------------
    // permissions / roles / grants
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`permissions\` (
        \`id\`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`code\`        VARCHAR(100) NOT NULL,
        \`resource\`    VARCHAR(50)  NOT NULL,
        \`action\`      VARCHAR(50)  NOT NULL,
        \`scope\`       VARCHAR(32)  NOT NULL DEFAULT 'TENANT',
        \`description\` VARCHAR(255) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_permissions_code\` (\`code\`),
        KEY \`idx_permissions_scope\` (\`scope\`),
        CONSTRAINT \`chk_permissions_scope\` CHECK (\`scope\` IN ('TENANT','PLATFORM'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`roles\` (
        \`id\`           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
        \`tenant_id\`    BIGINT UNSIGNED NULL,
        \`name\`         VARCHAR(100)    NOT NULL,
        \`code\`         VARCHAR(64)     NOT NULL,
        \`scope\`        VARCHAR(32)     NOT NULL DEFAULT 'TENANT',
        \`is_system\`    TINYINT(1)      NOT NULL DEFAULT 0,
        \`description\`  VARCHAR(255)    NULL,
        \`created_at\`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        -- Same NULL-distinctness problem as users: without a scope column, two
        -- system roles could share a code.
        \`tenant_scope\` BIGINT UNSIGNED GENERATED ALWAYS AS
                          (IFNULL(\`tenant_id\`, 0)) STORED NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_roles_scope_code\` (\`tenant_scope\`, \`code\`),
        KEY \`idx_roles_tenant\` (\`tenant_id\`),
        -- RESTRICT, not CASCADE. MySQL forbids CASCADE / SET NULL / SET DEFAULT on
        -- a column that a STORED generated column derives from, and \`tenant_id\`
        -- feeds \`tenant_scope\`. Tenant deletion therefore removes custom roles
        -- explicitly, which is the safer design anyway: erasing a tenant's whole
        -- data graph should be a deliberate, audited, batched operation rather than
        -- an implicit side effect of one DELETE.
        CONSTRAINT \`fk_roles_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`chk_roles_scope\` CHECK (\`scope\` IN ('TENANT','PLATFORM'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`role_permissions\` (
        \`role_id\`       INT UNSIGNED NOT NULL,
        \`permission_id\` INT UNSIGNED NOT NULL,
        PRIMARY KEY (\`role_id\`, \`permission_id\`),
        KEY \`idx_role_permissions_permission\` (\`permission_id\`),
        CONSTRAINT \`fk_role_permissions_role\` FOREIGN KEY (\`role_id\`)
          REFERENCES \`roles\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_role_permissions_permission\` FOREIGN KEY (\`permission_id\`)
          REFERENCES \`permissions\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`user_roles\` (
        \`id\`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\`      BIGINT UNSIGNED NOT NULL,
        \`role_id\`      INT UNSIGNED    NOT NULL,
        \`store_id\`     BIGINT UNSIGNED NULL,
        \`granted_by\`   BIGINT UNSIGNED NULL,
        \`granted_at\`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`expires_at\`   DATETIME(3)     NULL,
        -- NULL store_id means "all stores"; 0 makes that a real key value so the
        -- same grant cannot be inserted twice.
        \`store_scope\`  BIGINT UNSIGNED GENERATED ALWAYS AS
                          (IFNULL(\`store_id\`, 0)) STORED NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_user_roles_user_role_store\` (\`user_id\`, \`role_id\`, \`store_scope\`),
        KEY \`idx_user_roles_role\` (\`role_id\`),
        KEY \`idx_user_roles_expiry\` (\`expires_at\`),
        CONSTRAINT \`fk_user_roles_user\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_user_roles_role\` FOREIGN KEY (\`role_id\`)
          REFERENCES \`roles\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // -----------------------------------------------------------------------
    // refresh_tokens — rotation with family-level reuse detection.
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`refresh_tokens\` (
        \`id\`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\`        BIGINT UNSIGNED NOT NULL,
        \`tenant_id\`      BIGINT UNSIGNED NULL,
        \`family_id\`      CHAR(26)        NOT NULL,
        \`token_hash\`     CHAR(64)        NOT NULL,
        \`parent_id\`      BIGINT UNSIGNED NULL,
        \`jti\`            CHAR(26)        NOT NULL,
        \`user_agent\`     VARCHAR(500)    NULL,
        \`ip_address\`     VARBINARY(16)   NULL,
        \`device_label\`   VARCHAR(120)    NULL,
        \`expires_at\`     DATETIME(3)     NOT NULL,
        \`revoked_at\`     DATETIME(3)     NULL,
        \`revoked_reason\` VARCHAR(64)     NULL,
        \`used_at\`        DATETIME(3)     NULL,
        \`created_at\`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        -- The raw token is never stored, only its SHA-256.
        UNIQUE KEY \`uq_refresh_tokens_hash\` (\`token_hash\`),
        UNIQUE KEY \`uq_refresh_tokens_jti\` (\`jti\`),
        KEY \`idx_refresh_tokens_user\` (\`user_id\`, \`revoked_at\`),
        KEY \`idx_refresh_tokens_family\` (\`family_id\`),
        KEY \`idx_refresh_tokens_expiry\` (\`expires_at\`),
        CONSTRAINT \`fk_refresh_tokens_user\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // -----------------------------------------------------------------------
    // outbox_events — the transactional outbox (docs/01 §6).
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`outbox_events\` (
        \`id\`             BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
        \`event_id\`       CHAR(26)         NOT NULL,
        \`tenant_id\`      BIGINT UNSIGNED  NULL,
        \`aggregate_type\` VARCHAR(64)      NOT NULL,
        \`aggregate_id\`   BIGINT UNSIGNED  NOT NULL,
        \`event_type\`     VARCHAR(120)     NOT NULL,
        \`event_version\`  SMALLINT         NOT NULL DEFAULT 1,
        \`payload\`        JSON             NOT NULL,
        \`metadata\`       JSON             NULL,
        \`status\`         VARCHAR(16)      NOT NULL DEFAULT 'PENDING',
        \`attempts\`       TINYINT UNSIGNED NOT NULL DEFAULT 0,
        \`available_at\`   DATETIME(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`dispatched_at\`  DATETIME(3)      NULL,
        \`last_error\`     VARCHAR(1000)    NULL,
        \`created_at\`     DATETIME(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_outbox_event_id\` (\`event_id\`),
        -- The relay's only query: due PENDING rows, oldest first. Column order
        -- matters — status first (equality), then availability, then id for the sort.
        KEY \`idx_outbox_dispatch\` (\`status\`, \`available_at\`, \`id\`),
        KEY \`idx_outbox_aggregate\` (\`aggregate_type\`, \`aggregate_id\`),
        CONSTRAINT \`chk_outbox_status\` CHECK (\`status\` IN
          ('PENDING','DISPATCHING','DISPATCHED','FAILED','DEAD'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`processed_events\` (
        \`consumer_name\` VARCHAR(120) NOT NULL,
        \`event_id\`      CHAR(26)     NOT NULL,
        \`processed_at\`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`result\`        VARCHAR(32)  NOT NULL DEFAULT 'OK',
        -- This composite PK IS the idempotency mechanism: a duplicate delivery
        -- fails the insert instead of repeating the side effect.
        PRIMARY KEY (\`consumer_name\`, \`event_id\`),
        KEY \`idx_processed_events_cleanup\` (\`processed_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // -----------------------------------------------------------------------
    // audit_logs — append-only, quarterly RANGE partitions.
    //
    // No FK to tenants: audit rows must survive tenant deletion, and a CASCADE
    // would erase exactly the records a compliance investigation needs.
    // MySQL requires every unique key of a partitioned table to contain the
    // partitioning column, hence PRIMARY KEY (id, created_at).
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`audit_logs\` (
        \`id\`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`      BIGINT UNSIGNED NULL,
        \`actor_type\`     VARCHAR(32)     NOT NULL,
        \`actor_id\`       BIGINT UNSIGNED NULL,
        \`actor_email\`    VARCHAR(255)    NULL,
        \`action\`         VARCHAR(120)    NOT NULL,
        \`entity_type\`    VARCHAR(64)     NOT NULL,
        \`entity_id\`      BIGINT UNSIGNED NULL,
        \`before_state\`   JSON            NULL,
        \`after_state\`    JSON            NULL,
        \`changed_fields\` JSON            NULL,
        \`ip_address\`     VARBINARY(16)   NULL,
        \`user_agent\`     VARCHAR(500)    NULL,
        \`correlation_id\` CHAR(26)        NULL,
        \`severity\`       VARCHAR(16)     NOT NULL DEFAULT 'INFO',
        \`created_at\`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`, \`created_at\`),
        KEY \`idx_audit_logs_tenant\` (\`tenant_id\`, \`created_at\`),
        KEY \`idx_audit_logs_entity\` (\`entity_type\`, \`entity_id\`, \`created_at\`),
        KEY \`idx_audit_logs_actor\` (\`actor_type\`, \`actor_id\`, \`created_at\`),
        KEY \`idx_audit_logs_action\` (\`action\`, \`created_at\`),
        CONSTRAINT \`chk_audit_logs_actor_type\` CHECK (\`actor_type\` IN
          ('USER','CUSTOMER','SYSTEM','PLATFORM_ADMIN','API_KEY')),
        CONSTRAINT \`chk_audit_logs_severity\` CHECK (\`severity\` IN
          ('INFO','WARNING','CRITICAL'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      PARTITION BY RANGE (TO_DAYS(\`created_at\`)) (
        PARTITION \`p_2026_q3\` VALUES LESS THAN (TO_DAYS('2026-10-01')),
        PARTITION \`p_2026_q4\` VALUES LESS THAN (TO_DAYS('2027-01-01')),
        PARTITION \`p_2027_q1\` VALUES LESS THAN (TO_DAYS('2027-04-01')),
        PARTITION \`p_2027_q2\` VALUES LESS THAN (TO_DAYS('2027-07-01')),
        PARTITION \`p_max\`     VALUES LESS THAN MAXVALUE
      )
    `);

    // -----------------------------------------------------------------------
    // api_keys / job_runs
    // -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE \`api_keys\` (
        \`id\`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`          BIGINT UNSIGNED NOT NULL,
        \`public_id\`          CHAR(26)        NOT NULL,
        \`name\`               VARCHAR(120)    NOT NULL,
        \`key_prefix\`         CHAR(12)        NOT NULL,
        \`key_hash\`           CHAR(64)        NOT NULL,
        \`scopes\`             JSON            NOT NULL,
        \`rate_limit_per_min\` INT UNSIGNED    NOT NULL DEFAULT 60,
        \`allowed_ips\`        JSON            NULL,
        \`last_used_at\`       DATETIME(3)     NULL,
        \`expires_at\`         DATETIME(3)     NULL,
        \`revoked_at\`         DATETIME(3)     NULL,
        \`created_by\`         BIGINT UNSIGNED NULL,
        \`created_at\`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_api_keys_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_api_keys_hash\` (\`key_hash\`),
        KEY \`idx_api_keys_tenant\` (\`tenant_id\`, \`revoked_at\`),
        CONSTRAINT \`fk_api_keys_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`job_runs\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`        BIGINT UNSIGNED NULL,
        \`job_type\`         VARCHAR(64)     NOT NULL,
        \`status\`           VARCHAR(32)     NOT NULL DEFAULT 'QUEUED',
        \`queue_job_id\`     VARCHAR(120)    NULL,
        \`input_params\`     JSON            NULL,
        \`total_rows\`       INT UNSIGNED    NULL,
        \`processed_rows\`   INT UNSIGNED    NOT NULL DEFAULT 0,
        \`success_rows\`     INT UNSIGNED    NOT NULL DEFAULT 0,
        \`failed_rows\`      INT UNSIGNED    NOT NULL DEFAULT 0,
        \`error_report_url\` VARCHAR(500)    NULL,
        \`output_url\`       VARCHAR(500)    NULL,
        \`error_message\`    VARCHAR(1000)   NULL,
        \`started_at\`       DATETIME(3)     NULL,
        \`finished_at\`      DATETIME(3)     NULL,
        \`requested_by\`     BIGINT UNSIGNED NULL,
        \`correlation_id\`   CHAR(26)        NULL,
        \`created_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_job_runs_tenant\` (\`tenant_id\`, \`job_type\`, \`created_at\`),
        KEY \`idx_job_runs_status\` (\`status\`, \`created_at\`),
        CONSTRAINT \`fk_job_runs_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_job_runs_status\` CHECK (\`status\` IN
          ('QUEUED','RUNNING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED','CANCELLED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  /**
   * Every migration has a tested `down()` (docs/02 §22). Dropped in reverse
   * dependency order; the `tenants → users` FK is released first because it is a
   * cycle that would otherwise block both drops.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tenants\` DROP FOREIGN KEY \`fk_tenants_owner_user\``,
    );
    await queryRunner.query(`DROP TABLE \`job_runs\``);
    await queryRunner.query(`DROP TABLE \`api_keys\``);
    await queryRunner.query(`DROP TABLE \`audit_logs\``);
    await queryRunner.query(`DROP TABLE \`processed_events\``);
    await queryRunner.query(`DROP TABLE \`outbox_events\``);
    await queryRunner.query(`DROP TABLE \`refresh_tokens\``);
    await queryRunner.query(`DROP TABLE \`user_roles\``);
    await queryRunner.query(`DROP TABLE \`role_permissions\``);
    await queryRunner.query(`DROP TABLE \`roles\``);
    await queryRunner.query(`DROP TABLE \`permissions\``);
    await queryRunner.query(`DROP TABLE \`users\``);
    await queryRunner.query(`DROP TABLE \`tenant_domains\``);
    await queryRunner.query(`DROP TABLE \`tenants\``);
  }
}
