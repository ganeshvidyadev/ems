import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 11: reports, notifications, support. DDL matches
 * docs/02-data-model.md §18 (notifications & support) and the
 * `daily_sales_rollup` table from §19, with two additions:
 *
 *  - `notification_templates.is_system` — the same `isSystem` marker
 *    `RoleEntity` already carries for its own NULL-tenant system rows
 *    (platform-default templates), needed so `TenantGuardSubscriber` can
 *    tell "a deliberately shared default" from "a forgotten tenant_id" on
 *    insert. The doc's own DDL omits it, the same category of gap the
 *    `RefreshTokenUserType` migration already fixed for `refresh_tokens`.
 *  - `UNIQUE KEY` on `support_tickets.public_id` — the doc's DDL gives the
 *    table a `public_id` column but, like `product_shares`/`settlements`
 *    before it, never constrains it unique.
 */
export class ReportsNotificationsSupport1787300000000 implements MigrationInterface {
  name = 'ReportsNotificationsSupport1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`notification_templates\` (
        \`id\`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`            BIGINT UNSIGNED NULL,
        \`is_system\`            TINYINT(1)      NOT NULL DEFAULT 0,
        \`code\`                 VARCHAR(64)     NOT NULL,
        \`channel\`              VARCHAR(16)     NOT NULL,
        \`locale\`               VARCHAR(10)     NOT NULL DEFAULT 'en',
        \`subject\`              VARCHAR(500)    NULL,
        \`body\`                 MEDIUMTEXT      NOT NULL,
        \`provider_template_id\` VARCHAR(191)    NULL,
        \`variables\`            JSON            NULL,
        \`is_active\`            TINYINT(1)      NOT NULL DEFAULT 1,
        \`created_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`           DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_notif_templates\` (\`tenant_id\`, \`code\`, \`channel\`, \`locale\`),
        CONSTRAINT \`fk_notif_templates_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_notif_templates_channel\` CHECK (\`channel\` IN ('EMAIL','SMS','WHATSAPP','PUSH','IN_APP'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`notifications\` (
        \`id\`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`           BIGINT UNSIGNED NULL,
        \`recipient_type\`      VARCHAR(32)     NOT NULL,
        \`recipient_id\`        BIGINT UNSIGNED NULL,
        \`channel\`             VARCHAR(16)     NOT NULL,
        \`template_code\`       VARCHAR(64)     NULL,
        \`title\`               VARCHAR(255)    NULL,
        \`body\`                TEXT            NULL,
        \`action_url\`          VARCHAR(500)    NULL,
        \`status\`              VARCHAR(32)     NOT NULL DEFAULT 'QUEUED',
        \`provider\`            VARCHAR(32)     NULL,
        \`provider_message_id\` VARCHAR(191)    NULL,
        \`error_message\`       VARCHAR(500)    NULL,
        \`attempts\`            TINYINT UNSIGNED NOT NULL DEFAULT 0,
        \`read_at\`             DATETIME(3)     NULL,
        \`sent_at\`             DATETIME(3)     NULL,
        \`delivered_at\`        DATETIME(3)     NULL,
        \`correlation_id\`      CHAR(26)        NULL,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_notifications_recipient\` (\`recipient_type\`, \`recipient_id\`, \`read_at\`, \`created_at\`),
        KEY \`idx_notifications_status\` (\`status\`, \`created_at\`),
        KEY \`idx_notifications_provider\` (\`provider\`, \`provider_message_id\`),
        CONSTRAINT \`chk_notifications_status\` CHECK (\`status\` IN
          ('QUEUED','SENDING','SENT','DELIVERED','READ','FAILED','BOUNCED','SUPPRESSED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`support_tickets\` (
        \`id\`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`public_id\`           CHAR(26)        NOT NULL,
        \`ticket_number\`       VARCHAR(32)     NOT NULL,
        \`tenant_id\`           BIGINT UNSIGNED NULL,
        \`requester_user_id\`   BIGINT UNSIGNED NULL,
        \`subject\`             VARCHAR(255)    NOT NULL,
        \`category\`            VARCHAR(64)     NULL,
        \`priority\`            VARCHAR(16)     NOT NULL DEFAULT 'NORMAL',
        \`status\`              VARCHAR(32)     NOT NULL DEFAULT 'OPEN',
        \`assigned_to\`         BIGINT UNSIGNED NULL,
        \`first_response_at\`   DATETIME(3)     NULL,
        \`resolved_at\`         DATETIME(3)     NULL,
        \`closed_at\`           DATETIME(3)     NULL,
        \`sla_due_at\`          DATETIME(3)     NULL,
        \`satisfaction_rating\` TINYINT UNSIGNED NULL,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_support_tickets_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_support_tickets_number\` (\`ticket_number\`),
        KEY \`idx_support_tickets_tenant\` (\`tenant_id\`, \`status\`, \`created_at\`),
        KEY \`idx_support_tickets_assignee\` (\`assigned_to\`, \`status\`),
        KEY \`idx_support_tickets_sla\` (\`status\`, \`sla_due_at\`),
        CONSTRAINT \`chk_support_tickets_status\` CHECK (\`status\` IN
          ('OPEN','PENDING_CUSTOMER','IN_PROGRESS','ESCALATED','RESOLVED','CLOSED')),
        CONSTRAINT \`chk_support_tickets_priority\` CHECK (\`priority\` IN ('LOW','NORMAL','HIGH','URGENT')),
        CONSTRAINT \`chk_support_tickets_rating\` CHECK (\`satisfaction_rating\` IS NULL OR \`satisfaction_rating\` BETWEEN 1 AND 5)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`support_ticket_messages\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`ticket_id\`        BIGINT UNSIGNED NOT NULL,
        \`author_type\`      VARCHAR(32)     NOT NULL,
        \`author_id\`        BIGINT UNSIGNED NULL,
        \`body\`             MEDIUMTEXT      NOT NULL,
        \`attachments\`      JSON            NULL,
        \`is_internal_note\` TINYINT(1)      NOT NULL DEFAULT 0,
        \`created_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_ticket_messages_ticket\` (\`ticket_id\`, \`created_at\`),
        CONSTRAINT \`fk_ticket_messages_ticket\` FOREIGN KEY (\`ticket_id\`) REFERENCES \`support_tickets\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_ticket_messages_author\` CHECK (\`author_type\` IN ('REQUESTER','AGENT','SYSTEM'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`daily_sales_rollup\` (
        \`tenant_id\`           BIGINT UNSIGNED NOT NULL,
        \`store_id\`            BIGINT UNSIGNED NOT NULL,
        \`date\`                DATE            NOT NULL,
        \`channel\`             VARCHAR(32)     NOT NULL DEFAULT 'ALL',
        \`orders_count\`        INT UNSIGNED    NOT NULL DEFAULT 0,
        \`items_count\`         INT UNSIGNED    NOT NULL DEFAULT 0,
        \`gross_minor\`         BIGINT          NOT NULL DEFAULT 0,
        \`discount_minor\`      BIGINT          NOT NULL DEFAULT 0,
        \`tax_minor\`           BIGINT          NOT NULL DEFAULT 0,
        \`shipping_minor\`      BIGINT          NOT NULL DEFAULT 0,
        \`refund_minor\`        BIGINT          NOT NULL DEFAULT 0,
        \`net_minor\`           BIGINT          NOT NULL DEFAULT 0,
        \`cogs_minor\`          BIGINT          NOT NULL DEFAULT 0,
        \`new_customers\`       INT UNSIGNED    NOT NULL DEFAULT 0,
        \`returning_customers\` INT UNSIGNED    NOT NULL DEFAULT 0,
        \`cancelled_count\`     INT UNSIGNED    NOT NULL DEFAULT 0,
        \`updated_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`tenant_id\`, \`store_id\`, \`date\`, \`channel\`),
        KEY \`idx_daily_sales_date\` (\`date\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `daily_sales_rollup`');
    await queryRunner.query('DROP TABLE IF EXISTS `support_ticket_messages`');
    await queryRunner.query('DROP TABLE IF EXISTS `support_tickets`');
    await queryRunner.query('DROP TABLE IF EXISTS `notifications`');
    await queryRunner.query('DROP TABLE IF EXISTS `notification_templates`');
  }
}
