import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Generic key-value store for the public marketing site's copy (`website.content`) —
 * hero, features, header, footer, pricing-display overrides — editable from the
 * super-admin console without a redeploy. Same shape as `platform_settings`.
 */
export class WebsiteContent1789800000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE \`website_content\` (
        \`key\`        VARCHAR(64)     NOT NULL,
        \`value\`      JSON            NOT NULL,
        \`updated_at\` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`updated_by\` BIGINT UNSIGNED NULL,
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE `website_content`');
  }
}
