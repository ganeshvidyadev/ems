import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity, DATETIME3, BOOLEAN_COLUMN } from './base.entity';
import { TenantEntity } from './tenant.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';
import type { UserRoleEntity } from './user-role.entity';

export const USER_TYPES = ['PLATFORM', 'TENANT'] as const;
export type UserType = (typeof USER_TYPES)[number];

export const USER_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'LOCKED',
  'DEACTIVATED',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * One table for platform staff and tenant users, discriminated by `user_type`.
 *
 * Two near-identical tables would duplicate password hashing, MFA, lockout,
 * refresh-token rotation, and session management — five things that must behave
 * identically and would inevitably drift. The cost is a nullable `tenant_id`,
 * which a `CHECK` constraint in the migration keeps correlated with `user_type`.
 *
 * `allowNullTenant` because platform users legitimately have none; the guard
 * subscriber treats a NULL tenant here as "not tenant-owned" rather than an error.
 */
@Entity('users')
@TenantScoped({ allowNullTenant: true })
export class UserEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'user_type', type: 'varchar', length: 32, default: 'TENANT' })
  userType!: UserType;

  /** As typed by the user — preserved for display and for sending mail. */
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  /**
   * Lookup key: lowercased, with Gmail dot/plus variants collapsed.
   *
   * Without a normalized column, `Foo@Gmail.com` and `f.oo+shop@gmail.com` create
   * separate accounts that both receive mail at the same inbox — which breaks
   * "email is unique" in practice and enables duplicate-trial abuse.
   */
  @Column({ name: 'email_normalized', type: 'varchar', length: 255 })
  emailNormalized!: string;

  @Index('idx_users_phone')
  @Column({ name: 'phone_e164', type: 'varchar', length: 20, nullable: true })
  phoneE164!: string | null;

  /** NULL for SSO-only accounts, which have no password to verify. */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  /**
   * Algorithm tag. The hash itself is self-describing (`$2b$` vs `$argon2id$`),
   * but a column makes "how many users are still on bcrypt?" an indexable query
   * rather than a full-table string scan during a migration.
   */
  @Column({ name: 'password_algo', type: 'varchar', length: 16, default: 'bcrypt' })
  passwordAlgo!: string;

  @Column({ name: 'password_changed_at', ...DATETIME3, nullable: true })
  passwordChangedAt!: Date | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING_VERIFICATION' })
  status!: UserStatus;

  @Column({ name: 'email_verified_at', ...DATETIME3, nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'phone_verified_at', ...DATETIME3, nullable: true })
  phoneVerifiedAt!: Date | null;

  @Column({ name: 'mfa_enabled', ...BOOLEAN_COLUMN, default: 0 })
  mfaEnabled!: boolean;

  /** AES-256-GCM at the application layer — a DB dump must not yield TOTP seeds. */
  @Column({ name: 'mfa_secret_encrypted', type: 'varbinary', length: 512, nullable: true })
  mfaSecretEncrypted!: Buffer | null;

  /** Individually hashed; a leak of this column must not yield usable codes. */
  @Column({ name: 'mfa_recovery_codes', type: 'json', nullable: true })
  mfaRecoveryCodes!: string[] | null;

  /**
   * When enrolment was *confirmed*, not merely started.
   *
   * `mfa_enabled` alone cannot distinguish "scanned the QR and walked away" from
   * "genuinely protected". Treating the former as protected locks users out of their own
   * accounts, so the login path requires both flags.
   */
  @Column({ name: 'mfa_confirmed_at', ...DATETIME3, nullable: true })
  mfaConfirmedAt!: Date | null;

  /** Recovery codes consumed so far — drives the "only N left" warning. */
  @Column({ name: 'mfa_recovery_codes_used', type: 'smallint', unsigned: true, default: 0 })
  mfaRecoveryCodesUsed!: number;

  @Column({ name: 'failed_login_attempts', type: 'smallint', unsigned: true, default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: 'locked_until', ...DATETIME3, nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'last_login_at', ...DATETIME3, nullable: true })
  lastLoginAt!: Date | null;

  /** INET6_ATON form: IPv4 and IPv6 both fit in 16 bytes, and it sorts/ranges. */
  @Column({ name: 'last_login_ip', type: 'varbinary', length: 16, nullable: true })
  lastLoginIp!: Buffer | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  locale!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone!: string | null;

  @Column({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;

  /**
   * Generated stored column emulating a partial index. MySQL cannot index
   * `WHERE deleted_at IS NULL`, so this is included in the hot composite index
   * to keep "active users of tenant X" an index-only lookup.
   */
  @Column({
    name: 'is_live',
    type: 'tinyint',
    width: 1,
    generatedType: 'STORED',
    asExpression: 'CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END',
    insert: false,
    update: false,
    select: false,
  })
  isLive!: boolean;

  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  @OneToMany('UserRoleEntity', 'user')
  userRoles?: UserRoleEntity[];

  // -------------------------------------------------------------------------
  // Behaviour
  // -------------------------------------------------------------------------

  get isPlatformUser(): boolean {
    return this.userType === 'PLATFORM';
  }

  get emailVerified(): boolean {
    return this.emailVerifiedAt !== null;
  }

  /** Lockout is time-boxed, so this must be evaluated against the clock, not a flag. */
  get isLocked(): boolean {
    return this.lockedUntil !== null && this.lockedUntil.getTime() > Date.now();
  }

  get canAuthenticate(): boolean {
    return this.status === 'ACTIVE' && !this.isLocked && this.deletedAt === null;
  }

  get fullName(): string {
    return this.lastName ? `${this.firstName} ${this.lastName}` : this.firstName;
  }

  /**
   * Collapses provider-specific address aliases so one inbox maps to one account.
   * Gmail ignores dots in the local part and everything after `+`.
   */
  static normalizeEmail(email: string): string {
    const trimmed = email.trim().toLowerCase();
    const atIndex = trimmed.lastIndexOf('@');
    if (atIndex === -1) return trimmed;

    let local = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);

    const plusIndex = local.indexOf('+');
    if (plusIndex !== -1) local = local.slice(0, plusIndex);

    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      local = local.replace(/\./g, '');
      return `${local}@gmail.com`;
    }

    return `${local}@${domain}`;
  }
}
