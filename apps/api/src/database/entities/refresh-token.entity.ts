import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { NumericIdEntity, DATETIME3 } from './base.entity';
import { UserEntity, type UserType } from './user.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const REVOKE_REASONS = [
  'LOGOUT',
  'LOGOUT_ALL',
  'ROTATED',
  'REUSE_DETECTED',
  'PASSWORD_CHANGE',
  'ADMIN_REVOKED',
  'MFA_ENABLED',
  'EXPIRED',
] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];

/**
 * Refresh token record supporting rotation with family-level reuse detection
 * (docs/01 §8.1).
 *
 * The raw token is never stored — only its SHA-256. A database leak therefore
 * yields no usable tokens. SHA-256 rather than bcrypt is correct here: the token
 * is 256 bits of server-generated entropy, so there is no dictionary to attack,
 * and bcrypt's work factor on every refresh would be a pointless latency tax.
 */
@Entity('refresh_tokens')
@TenantScoped({ allowNullTenant: true })
export class RefreshTokenEntity extends NumericIdEntity {
  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  /**
   * The issuing user's own type — `TENANT` unless `tenantId` is NULL for a
   * platform-staff login. This is what lets `TenantGuardSubscriber` recognise
   * a NULL-tenant row here as deliberate rather than a bug (see
   * `isDeliberatelyGlobal`); `RoleEntity.scope` plays the identical role for
   * system roles.
   */
  @Column({ name: 'user_type', type: 'varchar', length: 32, default: 'TENANT' })
  userType!: UserType;

  /**
   * Rotation lineage. Every token minted from the same original login shares a
   * family; presenting an already-used token revokes the whole family, because a
   * replay means the token was captured and we cannot tell attacker from user.
   */
  @Index('idx_refresh_tokens_family')
  @Column({ name: 'family_id', type: 'char', length: 26 })
  familyId!: string;

  @Index('uq_refresh_tokens_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'parent_id', type: 'bigint', unsigned: true, nullable: true })
  parentId!: string | null;

  @Column({ type: 'char', length: 26 })
  jti!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'ip_address', type: 'varbinary', length: 16, nullable: true })
  ipAddress!: Buffer | null;

  /** "Chrome on Windows" — human-readable label for the sessions-management UI. */
  @Column({ name: 'device_label', type: 'varchar', length: 120, nullable: true })
  deviceLabel!: string | null;

  @Index('idx_refresh_tokens_expiry')
  @Column({ name: 'expires_at', ...DATETIME3 })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', ...DATETIME3, nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoked_reason', type: 'varchar', length: 64, nullable: true })
  revokedReason!: RevokeReason | null;

  /** Set on first use. A second presentation of a token with `used_at` set is the reuse signal. */
  @Column({ name: 'used_at', ...DATETIME3, nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  get isExpired(): boolean {
    return this.expiresAt.getTime() <= Date.now();
  }

  get isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  get isUsable(): boolean {
    return !this.isRevoked && !this.isExpired && this.usedAt === null;
  }
}
