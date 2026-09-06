import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bugfix, found while testing a real platform-admin login: `refresh_tokens`
 * is `@TenantScoped({ allowNullTenant: true })`, but `TenantGuardSubscriber`
 * only lets a NULL-tenant insert through when the entity itself proves it is
 * "deliberately global" (`isDeliberatelyGlobal`) — via `userType === 'PLATFORM'`,
 * `isSystem === true`, or `scope === 'PLATFORM'`. `RefreshTokenEntity` had
 * none of these, so a platform user's login threw `TenantContextMissingError`
 * ("insert into refresh_tokens requires a tenant context") on every attempt.
 * `RoleEntity` already carries exactly this marker for the same reason
 * (`scope`) — this migration gives `refresh_tokens` its own.
 *
 * `auth_tokens` has the identical `@TenantScoped({allowNullTenant:true})`
 * gap, but `AuthTokenService` writes it via raw parameterized `manager.query`
 * rather than the entity/repository API, which never invokes
 * `TenantGuardSubscriber` at all — so it was never actually broken and does
 * not need this column.
 */
export class RefreshTokenUserType1787100000000 implements MigrationInterface {
  name = 'RefreshTokenUserType1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`refresh_tokens\`
        ADD COLUMN \`user_type\` VARCHAR(32) NOT NULL DEFAULT 'TENANT' AFTER \`tenant_id\`,
        ADD CONSTRAINT \`chk_refresh_tokens_user_type\` CHECK (\`user_type\` IN ('PLATFORM','TENANT'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `refresh_tokens` DROP CONSTRAINT `chk_refresh_tokens_user_type`');
    await queryRunner.query('ALTER TABLE `refresh_tokens` DROP COLUMN `user_type`');
  }
}
