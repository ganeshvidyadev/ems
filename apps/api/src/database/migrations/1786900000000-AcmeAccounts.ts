import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 8: a single-row table holding the platform's own ACME account —
 * distinct from `tenant_domains` (per-domain state, already in
 * `InitialSchema`), because the ACME account key and its CA-assigned
 * account URL are shared across every tenant's certificate, not scoped to
 * any one of them. Not a `@TenantScoped()` table and not per-tenant data,
 * so it is a `PLATFORM_GLOBAL_ENTITIES` entry, the same reasoning as
 * `PlanEntity`/`ThemeTemplateEntity`.
 *
 * Keyed by `directory_url` rather than a fixed singleton id so staging and
 * production directories (different accounts, per Let's Encrypt) can each
 * have their own row without migrating data when `ACME_DIRECTORY_URL` changes.
 */
export class AcmeAccounts1786900000000 implements MigrationInterface {
  name = 'AcmeAccounts1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`acme_accounts\` (
        \`id\`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`directory_url\`            VARCHAR(500)    NOT NULL,
        \`account_url\`              VARCHAR(500)    NOT NULL,
        \`private_key_encrypted\`    MEDIUMBLOB      NOT NULL,
        \`jwk_thumbprint\`           VARCHAR(64)     NOT NULL,
        \`created_at\`               DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`               DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_acme_accounts_directory\` (\`directory_url\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `acme_accounts`');
  }
}
