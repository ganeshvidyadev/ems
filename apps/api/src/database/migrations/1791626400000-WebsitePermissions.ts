import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Existing installations must receive new permissions without re-running demo seeds. */
export class WebsitePermissions1791626400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      INSERT INTO permissions (code, resource, action, scope, description)
      VALUES ('platform.website:read', 'platform.website', 'read', 'PLATFORM', 'Read marketing website content'),
             ('platform.website:update', 'platform.website', 'update', 'PLATFORM', 'Update marketing website content')
      ON DUPLICATE KEY UPDATE scope = 'PLATFORM'
    `);
    await runner.query(`
      INSERT IGNORE INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.code = 'PLATFORM_SUPER_ADMIN' AND r.tenant_id IS NULL
        AND r.scope = 'PLATFORM' AND r.is_system = 1
        AND p.code IN ('platform.website:read', 'platform.website:update')
    `);
  }

  async down(): Promise<void> {
    // Additive reference data may already have existed through the seed runner.
    // Keep it on rollback rather than removing pre-existing/custom role grants.
  }
}
