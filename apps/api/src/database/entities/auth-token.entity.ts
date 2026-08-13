import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { NumericIdEntity, DATETIME3 } from './base.entity';
import { UserEntity } from './user.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const AUTH_TOKEN_PURPOSES = [
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'EMAIL_CHANGE',
  'MFA_CHALLENGE',
] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];

/**
 * Single-use, expiring, hashed token bound to a user.
 *
 * One table for every link-style token because the object is identical apart from
 * `purpose`; splitting it would triplicate the issue/consume/expire logic, and the
 * single-use check is exactly the part that gets forgotten in a copy.
 *
 * Only the SHA-256 is stored. The plaintext exists once, in the email. A
 * password-reset token is an account takeover, so a database leak must not hand one
 * over.
 */
@Entity('auth_tokens')
@TenantScoped({ allowNullTenant: true })
export class AuthTokenEntity extends NumericIdEntity {
  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  purpose!: AuthTokenPurpose;

  @Index('uq_auth_tokens_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  /** Masked email for "we sent a link to a…@example.com" — never replayable. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  identifier!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'expires_at', ...DATETIME3 })
  expiresAt!: Date;

  /** Non-null ⇒ consumed. Set in the same conditional UPDATE that consumes it. */
  @Column({ name: 'used_at', ...DATETIME3, nullable: true })
  usedAt!: Date | null;

  /**
   * Set when superseded — issuing a new reset invalidates outstanding ones, so an
   * attacker who intercepted an earlier email cannot still use it.
   */
  @Column({ name: 'invalidated_at', ...DATETIME3, nullable: true })
  invalidatedAt!: Date | null;

  @Column({ name: 'ip_address', type: 'varbinary', length: 16, nullable: true })
  ipAddress!: Buffer | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  get isUsable(): boolean {
    return (
      this.usedAt === null &&
      this.invalidatedAt === null &&
      this.expiresAt.getTime() > Date.now()
    );
  }
}
