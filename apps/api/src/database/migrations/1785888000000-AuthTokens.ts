import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2: single-use auth tokens and staff invitations.
 *
 * **One `auth_tokens` table rather than three.** Email verification, password reset
 * and email-change confirmation are the same object — a hashed, single-use,
 * expiring token bound to a user — differing only in `purpose`. Three near-identical
 * tables would mean three copies of the issue/consume/expire logic, and in practice
 * one of them always ends up missing the single-use check.
 *
 * Invitations are a **separate** table because the invariant is genuinely different:
 * the user does not exist yet. There is no `user_id` to bind to, and the row must
 * carry the email, tenant, and intended roles so the account can be created on
 * acceptance.
 *
 * Tokens are stored as SHA-256 only. The plaintext lives exactly once, in the email
 * that was sent. A database leak therefore yields no usable reset links — which
 * matters more here than anywhere else, because a password-reset token *is* an
 * account takeover.
 */
export class AuthTokens1785888000000 implements MigrationInterface {
  name = 'AuthTokens1785888000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`auth_tokens\` (
        \`id\`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\`      BIGINT UNSIGNED NOT NULL,
        \`tenant_id\`    BIGINT UNSIGNED NULL,
        \`purpose\`      VARCHAR(32)     NOT NULL,
        -- SHA-256 hex of the token. Never the token itself.
        \`token_hash\`   CHAR(64)        NOT NULL,
        -- Shown in the UI ("we sent a link to a…@example.com") without storing
        -- anything that could be replayed.
        \`identifier\`   VARCHAR(255)    NULL,
        \`metadata\`     JSON            NULL,
        \`expires_at\`   DATETIME(3)     NOT NULL,
        -- Non-null ⇒ already consumed. Presenting the token again must fail, so this
        -- is checked in the same UPDATE that sets it (see AuthTokenService.consume).
        \`used_at\`      DATETIME(3)     NULL,
        \`invalidated_at\` DATETIME(3)   NULL,
        \`ip_address\`   VARBINARY(16)   NULL,
        \`user_agent\`   VARCHAR(500)    NULL,
        \`created_at\`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_auth_tokens_hash\` (\`token_hash\`),
        -- Supports "invalidate every outstanding reset for this user", which is what
        -- issuing a new one must do.
        KEY \`idx_auth_tokens_user_purpose\` (\`user_id\`, \`purpose\`, \`used_at\`),
        KEY \`idx_auth_tokens_expiry\` (\`expires_at\`),
        CONSTRAINT \`fk_auth_tokens_user\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_auth_tokens_purpose\` CHECK (\`purpose\` IN
          ('EMAIL_VERIFICATION','PASSWORD_RESET','EMAIL_CHANGE','MFA_CHALLENGE'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`user_invitations\` (
        \`id\`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`public_id\`      CHAR(26)        NOT NULL,
        \`tenant_id\`      BIGINT UNSIGNED NOT NULL,
        \`email\`          VARCHAR(255)    NOT NULL,
        \`email_normalized\` VARCHAR(255)  NOT NULL,
        \`first_name\`     VARCHAR(100)    NULL,
        \`last_name\`      VARCHAR(100)    NULL,
        \`token_hash\`     CHAR(64)        NOT NULL,
        -- Role ids granted on acceptance, plus optional per-store scoping.
        \`role_ids\`       JSON            NOT NULL,
        \`store_id\`       BIGINT UNSIGNED NULL,
        \`status\`         VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
        \`invited_by\`     BIGINT UNSIGNED NULL,
        \`accepted_user_id\` BIGINT UNSIGNED NULL,
        \`expires_at\`     DATETIME(3)     NOT NULL,
        \`accepted_at\`    DATETIME(3)     NULL,
        \`revoked_at\`     DATETIME(3)     NULL,
        \`resent_count\`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        \`last_sent_at\`   DATETIME(3)     NULL,
        \`created_at\`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_user_invitations_public_id\` (\`public_id\`),
        UNIQUE KEY \`uq_user_invitations_token\` (\`token_hash\`),
        -- Per tenant, not global: the same person may be invited by two different
        -- merchants, and blocking that would be wrong.
        KEY \`idx_user_invitations_tenant_email\` (\`tenant_id\`, \`email_normalized\`, \`status\`),
        KEY \`idx_user_invitations_expiry\` (\`expires_at\`, \`status\`),
        CONSTRAINT \`fk_user_invitations_tenant\` FOREIGN KEY (\`tenant_id\`)
          REFERENCES \`tenants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_user_invitations_inviter\` FOREIGN KEY (\`invited_by\`)
          REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`chk_user_invitations_status\` CHECK (\`status\` IN
          ('PENDING','ACCEPTED','EXPIRED','REVOKED'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // Tracks when MFA enrolment was actually confirmed, as opposed to merely
    // started. `mfa_enabled` alone cannot distinguish "scanned the QR but never
    // verified a code" from "genuinely protected", and treating the former as
    // protected would lock users out of their own accounts.
    await queryRunner.query(`
      ALTER TABLE \`users\`
        ADD COLUMN \`mfa_confirmed_at\` DATETIME(3) NULL AFTER \`mfa_recovery_codes\`,
        ADD COLUMN \`mfa_recovery_codes_used\` SMALLINT UNSIGNED NOT NULL DEFAULT 0
          AFTER \`mfa_confirmed_at\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
        DROP COLUMN \`mfa_recovery_codes_used\`,
        DROP COLUMN \`mfa_confirmed_at\`
    `);
    await queryRunner.query(`DROP TABLE \`user_invitations\``);
    await queryRunner.query(`DROP TABLE \`auth_tokens\``);
  }
}
