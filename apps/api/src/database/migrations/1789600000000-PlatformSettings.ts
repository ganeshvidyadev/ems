import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Generic key-value store for platform-wide configuration (`platform.settings`) —
 * maintenance mode, support SLA hours, and future settings, without a schema
 * change per new setting.
 */
export class PlatformSettings1789600000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE \`platform_settings\` (
        \`key\`        VARCHAR(64)     NOT NULL,
        \`value\`      JSON            NOT NULL,
        \`updated_at\` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`updated_by\` BIGINT UNSIGNED NULL,
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE `platform_settings`');
  }
}
