import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Platform Alert Center — a real lifecycle (OPEN -> ACKNOWLEDGED -> INVESTIGATING ->
 * RESOLVED), not just a computed-on-read list, because acknowledgement has to be
 * remembered between requests.
 *
 * `dedupe_key` (unique) is what "avoid generating duplicate alerts continuously for
 * the same incident" means in practice: `PlatformAlertService.reconcile()` upserts on
 * it, so re-detecting a condition that's already open just bumps `last_seen_at`
 * rather than creating a second row.
 *
 * `tenant_id` has no FK: an alert is a log-like historical record (same reasoning
 * `audit_logs.tenant_id` already uses), and a hard FK would either block deleting a
 * tenant with open alerts or cascade-delete the very history a security/ops review
 * might need after that tenant is gone.
 */
export class PlatformAlerts1789700000000 implements MigrationInterface {
  name = 'PlatformAlerts1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`platform_alerts\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`type\`             VARCHAR(64)     NOT NULL,
        \`dedupe_key\`       VARCHAR(191)    NOT NULL,
        \`tenant_id\`        BIGINT UNSIGNED NULL,
        \`severity\`         VARCHAR(16)     NOT NULL,
        \`status\`           VARCHAR(16)     NOT NULL DEFAULT 'OPEN',
        \`title\`            VARCHAR(255)    NOT NULL,
        \`description\`      TEXT            NULL,
        \`metadata\`         JSON            NULL,
        \`first_seen_at\`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`last_seen_at\`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`acknowledged_at\`  DATETIME(3)     NULL,
        \`acknowledged_by\`  BIGINT UNSIGNED NULL,
        \`resolved_at\`      DATETIME(3)     NULL,
        \`resolved_by\`      BIGINT UNSIGNED NULL,
        \`created_at\`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_platform_alerts_dedupe_key\` (\`dedupe_key\`),
        KEY \`idx_platform_alerts_status\` (\`status\`, \`severity\`, \`last_seen_at\`),
        KEY \`idx_platform_alerts_tenant\` (\`tenant_id\`, \`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `platform_alerts`');
  }
}
