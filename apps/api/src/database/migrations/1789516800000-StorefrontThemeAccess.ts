import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StorefrontThemeAccess1789516800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      "ALTER TABLE tenants ADD COLUMN storefront_theme VARCHAR(64) NOT NULL DEFAULT 'default', ADD COLUMN allowed_storefront_themes JSON NULL",
    );
    await runner.query(
      "UPDATE tenants SET storefront_theme = 'organic', allowed_storefront_themes = ? WHERE slug = 'northwind'",
      [JSON.stringify(['default', 'organic'])],
    );
    await runner.query(
      "UPDATE tenants SET storefront_theme = 'famms', allowed_storefront_themes = ? WHERE slug = 'lakeside'",
      [JSON.stringify(['default', 'famms'])],
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE tenants DROP COLUMN allowed_storefront_themes, DROP COLUMN storefront_theme',
    );
  }
}
