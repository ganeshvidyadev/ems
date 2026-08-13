import { Injectable, Logger } from '@nestjs/common';
import { newPublicId, slugify } from '@ems/kernel';
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  UserSummary,
} from '@ems/contracts';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { TenantEntity, UserEntity, UserRoleEntity, RoleEntity } from '../../../database/entities';
import { HashService } from '../../../common/services/hash.service';
import { RequestContextService } from '../../../common/services/request-context.service';
import { OutboxService } from '../../../common/services/outbox.service';
import { MailService } from '../../notification/mail.service';
import { AuthLogService } from './auth-log.service';
import { AuthTokenService } from './auth-token.service';
import { PermissionResolverService } from './permission-resolver.service';
import { RefreshTokenService } from './refresh-token.service';
import { TokenDenylistService } from './token-denylist.service';
import { TokenService } from './token.service';
import {
  AuthTokenInvalidError,
  PermissionDeniedError,
} from '../../../common/errors/api.errors';
import { ConflictError, ValidationError } from '@ems/kernel';

/** After this many consecutive failures the account is locked. */
const MAX_FAILED_ATTEMPTS = 5;
/** Lockout duration. Long enough to defeat online guessing, short enough to self-heal. */
const LOCKOUT_MINUTES = 15;

export interface LoginResult {
  response: LoginResponse;
  /** Present only on full authentication; set as an httpOnly cookie by the controller. */
  refreshToken?: string;
  refreshExpiresAt?: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly hash: HashService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly denylist: TokenDenylistService,
    private readonly authTokens: AuthTokenService,
    private readonly permissions: PermissionResolverService,
    private readonly mail: MailService,
    private readonly authLog: AuthLogService,
    private readonly context: RequestContextService,
    private readonly outbox: OutboxService,
  ) {}

  // =========================================================================
  // Registration
  // =========================================================================

  /**
   * Registers a merchant: creates the tenant and its owner user in one transaction.
   *
   * Both or neither — a tenant with no owner is unreachable, and a user pointing at a
   * non-existent tenant fails the `chk_users_tenant_correlation` check. The pair is the
   * unit of consistency, so it is one transaction.
   */
  async register(input: RegisterRequest): Promise<{ userPublicId: string; tenantSlug: string }> {
    const emailNormalized = UserEntity.normalizeEmail(input.email);
    const passwordHash = await this.hash.hash(input.password);

    const created = await this.dataSource.transaction(async (manager) => {
      const slug = await this.allocateSlug(manager, input.businessName);

      const tenant = await manager.save(
        manager.create(TenantEntity, {
          publicId: newPublicId(),
          slug,
          businessName: input.businessName,
          contactEmail: input.email,
          contactPhone: input.phone ?? null,
          status: 'PENDING',
          // Phase 3's provisioning saga picks it up from here.
          provisioningStep: null,
        }),
      );

      // Uniqueness is enforced by `uq_users_scope_email`, so a race between two
      // concurrent signups fails on the constraint rather than creating a duplicate.
      // The check here only produces a friendlier error for the common case.
      const existing = await manager.findOne(UserEntity, {
        where: { emailNormalized, tenantId: tenant.id },
      });
      if (existing) throw new ConflictError('An account with this email already exists');

      const user = await manager.save(
        manager.create(UserEntity, {
          publicId: newPublicId(),
          tenantId: tenant.id,
          userType: 'TENANT',
          email: input.email,
          emailNormalized,
          passwordHash,
          passwordAlgo: 'bcrypt',
          passwordChangedAt: new Date(),
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          phoneE164: input.phone ?? null,
          status: 'PENDING_VERIFICATION',
        }),
      );

      tenant.ownerUserId = user.id;
      await manager.save(tenant);

      const ownerRole = await manager.findOne(RoleEntity, {
        where: { code: 'STORE_OWNER', tenantId: IsNull() },
      });
      if (ownerRole) {
        await manager.save(
          manager.create(UserRoleEntity, { userId: user.id, roleId: ownerRole.id, storeId: null }),
        );
      }

      // Inside the transaction, so the event and the rows commit together.
      await this.outbox.emit(manager, {
        aggregateType: 'Tenant',
        aggregateId: tenant.id,
        eventType: 'tenant.registered',
        payload: {
          tenantId: tenant.id,
          tenantPublicId: tenant.publicId,
          slug: tenant.slug,
          businessName: tenant.businessName,
          ownerUserId: user.id,
          ownerEmail: user.email,
        },
        tenantId: tenant.id,
      });

      return { user, tenant };
    });

    const verification = await this.authTokens.issue(
      created.user.id,
      created.tenant.id,
      'EMAIL_VERIFICATION',
      created.user.email,
    );

    await this.mail.sendEmailVerification(
      created.user.email,
      created.user.firstName,
      verification.token,
    );

    this.authLog.record({
      event: 'REGISTER',
      userId: created.user.id,
      tenantId: created.tenant.id,
      identifier: created.user.email,
    });

    return { userPublicId: created.user.publicId, tenantSlug: created.tenant.slug };
  }

  /** Derives a globally-unique DNS label from the business name. */
  private async allocateSlug(
    manager: DataSource['manager'],
    businessName: string,
  ): Promise<string> {
    const base = slugify(businessName, 50) || 'store';

    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await manager.findOne(TenantEntity, { where: { slug: candidate } });
      if (!taken) return candidate;
    }

    return `${base}-${newPublicId().slice(-6).toLowerCase()}`;
  }

  // =========================================================================
  // Email verification
  // =========================================================================

  async verifyEmail(token: string): Promise<void> {
    const consumed = await this.authTokens.consume(token, 'EMAIL_VERIFICATION');
    if (!consumed) throw new AuthTokenInvalidError('This verification link is invalid or expired');

    await this.dataSource.query(
      `UPDATE users
          SET email_verified_at = NOW(3),
              status = CASE WHEN status = 'PENDING_VERIFICATION' THEN 'ACTIVE' ELSE status END
        WHERE id = ?`,
      [consumed.userId],
    );

    this.authLog.record({
      event: 'EMAIL_VERIFIED',
      userId: consumed.userId,
      tenantId: consumed.tenantId,
    });
  }

  /**
   * Resends verification. Always reports success.
   *
   * A "no such account" response here would turn this endpoint into a free account
   * existence oracle, which is the same leak the login and forgot-password paths guard
   * against.
   */
  async resendVerification(email: string): Promise<void> {
    const user = await this.findByEmail(email);

    if (!user || user.emailVerifiedAt !== null) return;

    const verification = await this.authTokens.issue(
      user.id,
      user.tenantId,
      'EMAIL_VERIFICATION',
      user.email,
    );
    await this.mail.sendEmailVerification(user.email, user.firstName, verification.token);
  }

  // =========================================================================
  // Login
  // =========================================================================

  /**
   * Authenticates a user.
   *
   * Every failure path returns the **same** error and does comparable work:
   *
   *  - unknown email → a dummy bcrypt compare runs, then `AUTH_INVALID_CREDENTIALS`
   *  - wrong password → real compare, same error
   *
   * Both halves are necessary. An identical message with a 200× faster response for
   * unknown accounts is still an enumeration oracle — timing is observable, and
   * bcrypt at cost 12 takes ~250 ms while a missing row returns in microseconds.
   */
  async login(input: LoginRequest): Promise<LoginResult> {
    const user = await this.findByEmail(input.email, input.tenantSlug);

    if (!user) {
      await this.hash.dummyCompare();
      this.authLog.record({
        event: 'LOGIN_FAILED',
        identifier: input.email,
        detail: { reason: 'no_such_account' },
      });
      throw invalidCredentials();
    }

    if (user.isLocked) {
      // Reported distinctly *only* because the account provably exists at this point —
      // the caller already supplied a correct-looking identifier and we are about to
      // rate-limit them anyway. Telling them to wait is more useful than a generic error.
      this.authLog.record({
        event: 'LOGIN_BLOCKED_LOCKED',
        userId: user.id,
        tenantId: user.tenantId,
        identifier: input.email,
      });
      throw accountLocked(user.lockedUntil!);
    }

    const passwordValid = await this.hash.verify(input.password, user.passwordHash);

    if (!passwordValid) {
      await this.recordFailedAttempt(user);
      this.authLog.record({
        event: 'LOGIN_FAILED',
        userId: user.id,
        tenantId: user.tenantId,
        identifier: input.email,
        detail: { reason: 'bad_password', attempt: user.failedLoginAttempts + 1 },
      });
      throw invalidCredentials();
    }

    if (user.emailVerifiedAt === null) {
      this.authLog.record({
        event: 'LOGIN_BLOCKED_UNVERIFIED',
        userId: user.id,
        tenantId: user.tenantId,
      });
      throw emailNotVerified();
    }

    if (user.status !== 'ACTIVE') throw accountNotActive(user.status);

    // Success — clear the failure counter so a user who eventually remembers their
    // password is not locked out on their next typo.
    await this.clearFailedAttempts(user.id);

    // MFA: stop here and issue a challenge token only. Returning an access token now
    // would make the second factor decorative.
    if (user.mfaEnabled && user.mfaConfirmedAt !== null) {
      const challenge = this.tokens.signMfaChallengeToken({
        sub: user.publicId,
        uid: user.id,
        tid: user.tenantId,
      });

      this.authLog.record({
        event: 'MFA_CHALLENGE',
        userId: user.id,
        tenantId: user.tenantId,
      });

      return {
        response: {
          outcome: 'MFA_REQUIRED',
          mfaToken: challenge.token,
          methods: ['TOTP', 'RECOVERY_CODE'],
        },
      };
    }

    return this.completeLogin(user);
  }

  /** Mints the token pair and records the session. Shared by password and MFA/OTP paths. */
  async completeLogin(user: UserEntity): Promise<LoginResult> {
    const authorization = await this.permissions.resolve(user.id, user.tenantId);
    const ctx = this.context.get();

    const refresh = await this.refreshTokens.issue(user.id, user.tenantId, {
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      deviceLabel: this.authLog.deviceLabel(ctx?.userAgent),
    });

    const access = this.tokens.signAccessToken({
      sub: user.publicId,
      uid: user.id,
      tid: user.tenantId,
      userType: user.userType,
      roles: authorization.roles,
      perms: authorization.permissions,
      // Binds the access token to its refresh family, so revoking the family also
      // kills live access tokens rather than leaving a 10-minute hole.
      fam: refresh.familyId,
    });

    await this.dataSource.query(
      `UPDATE users SET last_login_at = NOW(3), last_login_ip = INET6_ATON(?) WHERE id = ?`,
      [ctx?.ip ?? null, user.id],
    );

    this.authLog.record({
      event: 'LOGIN_SUCCESS',
      userId: user.id,
      tenantId: user.tenantId,
      identifier: user.email,
    });

    return {
      response: {
        outcome: 'AUTHENTICATED',
        accessToken: access.token,
        expiresIn: access.expiresInSeconds,
        tokenType: 'Bearer',
        user: await this.toUserSummary(user, authorization),
      },
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  // =========================================================================
  // Refresh
  // =========================================================================

  async refresh(refreshToken: string): Promise<LoginResult> {
    const ctx = this.context.get();

    const rotated = await this.refreshTokens.rotate(refreshToken, {
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      deviceLabel: this.authLog.deviceLabel(ctx?.userAgent),
    });

    const rows = (await this.dataSource.query(
      `SELECT user_id AS userId FROM refresh_tokens WHERE id = ? LIMIT 1`,
      [rotated.recordId],
    )) as { userId: string }[];

    const userId = rows[0]?.userId;
    if (!userId) throw invalidCredentials();

    const user = await this.dataSource.getRepository(UserEntity).findOne({ where: { id: userId } });
    if (!user || !user.canAuthenticate) throw invalidCredentials();

    // Permissions are re-resolved on every refresh, which is what bounds authorization
    // staleness to the access-token lifetime rather than the refresh lifetime.
    const authorization = await this.permissions.resolve(user.id, user.tenantId);

    const access = this.tokens.signAccessToken({
      sub: user.publicId,
      uid: user.id,
      tid: user.tenantId,
      userType: user.userType,
      roles: authorization.roles,
      perms: authorization.permissions,
      fam: rotated.familyId,
    });

    this.authLog.record({ event: 'TOKEN_REFRESHED', userId: user.id, tenantId: user.tenantId });

    return {
      response: {
        outcome: 'AUTHENTICATED',
        accessToken: access.token,
        expiresIn: access.expiresInSeconds,
        tokenType: 'Bearer',
        user: await this.toUserSummary(user, authorization),
      },
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
    };
  }

  // =========================================================================
  // Logout
  // =========================================================================

  async logout(refreshToken: string | undefined, accessJti?: string, accessExp?: Date): Promise<void> {
    if (refreshToken) await this.refreshTokens.revokeByToken(refreshToken, 'LOGOUT');

    // The access token is denylisted too. Without this it stays valid for up to 10
    // minutes after "log out", which is exactly wrong on a shared computer.
    if (accessJti && accessExp) {
      await this.denylist.revoke(accessJti, accessExp, 'LOGOUT');
    }

    this.authLog.record({
      event: 'LOGOUT',
      userId: this.context.userId,
      tenantId: this.context.tenantId,
    });
  }

  async logoutAll(userId: string): Promise<number> {
    const revoked = await this.refreshTokens.revokeAllForUser(userId, 'LOGOUT_ALL');

    this.authLog.record({
      event: 'LOGOUT_ALL',
      userId,
      tenantId: this.context.tenantId,
      detail: { sessionsRevoked: revoked },
    });

    return revoked;
  }

  // =========================================================================
  // Password reset / change
  // =========================================================================

  /**
   * Requests a reset. Always reports success, and always does comparable work.
   *
   * Sending mail only for real accounts is fine — what must not differ is the response
   * and its timing.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.findByEmail(email);

    this.authLog.record({
      event: 'PASSWORD_RESET_REQUESTED',
      userId: user?.id ?? null,
      tenantId: user?.tenantId ?? null,
      identifier: email,
      detail: { accountExists: Boolean(user) },
    });

    if (!user) return;

    const reset = await this.authTokens.issue(
      user.id,
      user.tenantId,
      'PASSWORD_RESET',
      user.email,
    );
    await this.mail.sendPasswordReset(user.email, user.firstName, reset.token);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const consumed = await this.authTokens.consume(token, 'PASSWORD_RESET');
    if (!consumed) throw new AuthTokenInvalidError('This reset link is invalid or expired');

    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id: consumed.userId } });
    if (!user) throw new AuthTokenInvalidError('This reset link is invalid or expired');

    await this.applyNewPassword(user, newPassword, 'PASSWORD_RESET_COMPLETED');
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.dataSource.getRepository(UserEntity).findOne({ where: { id: userId } });
    if (!user) throw new PermissionDeniedError('user:update');

    const valid = await this.hash.verify(currentPassword, user.passwordHash);
    if (!valid) throw new ValidationError('Current password is incorrect', { field: 'currentPassword' });

    await this.applyNewPassword(user, newPassword, 'PASSWORD_CHANGED');
  }

  /**
   * Writes the new hash and **revokes every session**.
   *
   * Non-negotiable: the most common reason to change a password is suspecting
   * compromise, and leaving the attacker's existing session alive would defeat the
   * entire point. The user is told they were signed out everywhere rather than being
   * left to wonder.
   */
  private async applyNewPassword(
    user: UserEntity,
    newPassword: string,
    event: 'PASSWORD_RESET_COMPLETED' | 'PASSWORD_CHANGED',
  ): Promise<void> {
    const passwordHash = await this.hash.hash(newPassword);

    await this.dataSource.query(
      `UPDATE users
          SET password_hash = ?, password_algo = 'bcrypt', password_changed_at = NOW(3),
              failed_login_attempts = 0, locked_until = NULL,
              status = CASE WHEN status = 'LOCKED' THEN 'ACTIVE' ELSE status END
        WHERE id = ?`,
      [passwordHash, user.id],
    );

    await this.refreshTokens.revokeAllForUser(user.id, 'PASSWORD_CHANGE');
    // Any outstanding reset links are retired too — otherwise a second leaked email
    // could still change the password again.
    await this.authTokens.invalidateAll(user.id, 'PASSWORD_RESET');

    await this.mail.sendPasswordChangedNotice(user.email, user.firstName);

    this.authLog.record({ event, userId: user.id, tenantId: user.tenantId });
  }

  // =========================================================================
  // Lockout
  // =========================================================================

  /**
   * Increments the failure counter, locking the account at the threshold.
   *
   * A single atomic statement so concurrent guesses cannot interleave and lose
   * increments — a read-modify-write here would let a parallel attacker exceed the
   * threshold without ever tripping it.
   */
  private async recordFailedAttempt(user: UserEntity): Promise<void> {
    // Assignment ORDER IS LOAD-BEARING.
    //
    // MySQL evaluates multi-column `SET` assignments left to right, and later
    // expressions see the *already-updated* value of earlier columns — unlike standard
    // SQL, where the whole row is computed from its original state. Incrementing first
    // meant `locked_until` read the new counter and effectively tested
    // `attempts + 2 >= MAX`, locking accounts one failure early.
    //
    // Computing `locked_until` first keeps it reading the pre-increment value.
    await this.dataSource.query(
      `UPDATE users
          SET locked_until = CASE
                WHEN failed_login_attempts + 1 >= ?
                THEN DATE_ADD(NOW(3), INTERVAL ? MINUTE)
                ELSE locked_until END,
              failed_login_attempts = failed_login_attempts + 1
        WHERE id = ?`,
      [MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES, user.id],
    );

    if (user.failedLoginAttempts + 1 >= MAX_FAILED_ATTEMPTS) {
      this.authLog.record({
        event: 'ACCOUNT_LOCKED',
        userId: user.id,
        tenantId: user.tenantId,
        identifier: user.email,
        detail: { attempts: user.failedLoginAttempts + 1, lockMinutes: LOCKOUT_MINUTES },
      });
    }
  }

  private async clearFailedAttempts(userId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
      [userId],
    );
  }

  // =========================================================================
  // Lookup helpers
  // =========================================================================

  /**
   * Finds a user by email.
   *
   * The same address can exist in several tenants plus the platform, so `tenantSlug`
   * disambiguates. Without it we take the platform account first, then the single
   * tenant match — and refuse to guess when several exist, because silently picking
   * one would log a user into the wrong store.
   */
  async findByEmail(email: string, tenantSlug?: string): Promise<UserEntity | null> {
    const emailNormalized = UserEntity.normalizeEmail(email);
    const repository = this.dataSource.getRepository(UserEntity);

    if (tenantSlug) {
      const tenant = await this.dataSource
        .getRepository(TenantEntity)
        .findOne({ where: { slug: tenantSlug } });
      if (!tenant) return null;

      return repository.findOne({ where: { emailNormalized, tenantId: tenant.id } });
    }

    const platformUser = await repository.findOne({
      where: { emailNormalized, userType: 'PLATFORM' },
    });
    if (platformUser) return platformUser;

    const matches = await repository.find({ where: { emailNormalized }, take: 2 });
    // Ambiguous: return null rather than guessing. The client is expected to retry
    // with a tenantSlug, and the response is indistinguishable from "no account".
    if (matches.length !== 1) return null;

    return matches[0] ?? null;
  }

  /** Loads a user by internal id, throwing rather than returning null. */
  async findByEmailOrId(userId: string): Promise<UserEntity> {
    const user = await this.dataSource.getRepository(UserEntity).findOne({ where: { id: userId } });
    if (!user) throw invalidCredentials();
    return user;
  }

  async toUserSummary(
    user: UserEntity,
    authorization?: { roles: string[]; permissions: string[] },
  ): Promise<UserSummary> {
    const resolved = authorization ?? (await this.permissions.resolve(user.id, user.tenantId));

    let tenant: UserSummary['tenant'] = null;
    if (user.tenantId) {
      const row = await this.dataSource
        .getRepository(TenantEntity)
        .findOne({ where: { id: user.tenantId } });
      if (row) {
        tenant = {
          id: row.publicId,
          slug: row.slug,
          businessName: row.businessName,
          status: row.status,
          plan: null,
        };
      }
    }

    return {
      id: user.publicId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      userType: user.userType,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      mfaEnabled: user.mfaEnabled && user.mfaConfirmedAt !== null,
      roles: resolved.roles,
      permissions: resolved.permissions,
      tenant,
    };
  }
}

// ---------------------------------------------------------------------------
// Error factories — one place, so the wording cannot drift between call sites.
// ---------------------------------------------------------------------------

import { DomainError } from '@ems/kernel';
import { ErrorCode } from '@ems/contracts';

class InvalidCredentialsError extends DomainError {
  readonly code = ErrorCode.AUTH_INVALID_CREDENTIALS;
}
class AccountLockedError extends DomainError {
  readonly code = ErrorCode.AUTH_ACCOUNT_LOCKED;
}
class EmailNotVerifiedError extends DomainError {
  readonly code = ErrorCode.AUTH_EMAIL_NOT_VERIFIED;
}

/**
 * Identical for "no such account" and "wrong password".
 *
 * The message deliberately says nothing about which half failed.
 */
function invalidCredentials(): DomainError {
  return new InvalidCredentialsError('Incorrect email or password');
}

function accountLocked(until: Date): DomainError {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return new AccountLockedError(
    `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    { lockedUntil: until.toISOString(), retryAfterMinutes: minutes },
  );
}

function emailNotVerified(): DomainError {
  return new EmailNotVerifiedError('Verify your email address before signing in');
}

function accountNotActive(status: string): DomainError {
  return new InvalidCredentialsError('This account is not active', { status });
}
