import { Injectable, Logger } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  newPublicId,
} from '@ems/kernel';
import type {
  AcceptInvitationRequest,
  CreateInvitationRequest,
  InvitationPreview,
  InvitationResponse,
} from '@ems/contracts';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull } from 'typeorm';
import {
  RoleEntity,
  TenantEntity,
  UserEntity,
  UserInvitationEntity,
  UserRoleEntity,
} from '../../database/entities';
import { CryptoService } from '../../common/services/crypto.service';
import { HashService } from '../../common/services/hash.service';
import { RequestContextService } from '../../common/services/request-context.service';
import { MailService } from '../notification/mail.service';
import { AuthLogService } from '../auth/services/auth-log.service';
import { PermissionResolverService } from '../auth/services/permission-resolver.service';

const INVITATION_TTL_DAYS = 7;
const MAX_RESENDS = 5;
const RESEND_COOLDOWN_MINUTES = 5;

/**
 * Staff invitations.
 *
 * The invitee sets their own password on acceptance; the email carries only a
 * single-use token. Mailing a temporary password would leave a working credential
 * sitting in an inbox indefinitely, and in practice most recipients never change it.
 */
@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: CryptoService,
    private readonly hash: HashService,
    private readonly mail: MailService,
    private readonly authLog: AuthLogService,
    private readonly permissions: PermissionResolverService,
    private readonly context: RequestContextService,
  ) {}

  // -------------------------------------------------------------------------
  // Issue
  // -------------------------------------------------------------------------

  async invite(input: CreateInvitationRequest): Promise<InvitationResponse> {
    const tenantId = this.context.requireTenantId('invite staff');
    const inviterId = this.context.userId;
    const emailNormalized = UserEntity.normalizeEmail(input.email);

    const roles = await this.resolveRoles(input.roleCodes, tenantId);

    const created = await this.dataSource.transaction(async (manager) => {
      // Already staff here? Re-inviting would create a second account for the same
      // person in the same tenant, which `uq_users_scope_email` would reject anyway —
      // but with an opaque duplicate-key error instead of a useful message.
      const existingUser = await manager.findOne(UserEntity, {
        where: { emailNormalized, tenantId },
      });
      if (existingUser) {
        throw new ConflictError('That person is already a member of this store');
      }

      // Supersede any outstanding invite rather than stacking them, so an earlier
      // intercepted email cannot still be redeemed.
      await manager.query(
        `UPDATE user_invitations
            SET status = 'REVOKED', revoked_at = NOW(3)
          WHERE tenant_id = ? AND email_normalized = ? AND status = 'PENDING'`,
        [tenantId, emailNormalized],
      );

      const plaintext = this.crypto.generateToken(32);

      const invitation = await manager.save(
        manager.create(UserInvitationEntity, {
          publicId: newPublicId(),
          tenantId,
          email: input.email,
          emailNormalized,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          tokenHash: this.crypto.hashToken(plaintext),
          roleIds: roles.map((role) => role.id),
          storeId: input.storeId ?? null,
          status: 'PENDING',
          invitedBy: inviterId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
          lastSentAt: new Date(),
        }),
      );

      return { invitation, plaintext, roles };
    });

    const tenant = await this.dataSource
      .getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });
    const inviter = inviterId
      ? await this.dataSource.getRepository(UserEntity).findOne({ where: { id: inviterId } })
      : null;

    await this.mail.sendStaffInvitation(
      input.email,
      inviter?.fullName ?? 'A colleague',
      tenant?.businessName ?? 'the store',
      created.plaintext,
    );

    this.authLog.record({
      event: 'INVITATION_SENT',
      userId: inviterId,
      tenantId,
      identifier: input.email,
      detail: { roles: input.roleCodes, storeScoped: Boolean(input.storeId) },
    });

    return this.toResponse(created.invitation, created.roles.map((role) => role.code), inviter);
  }

  /**
   * Resends an invitation, reusing the same row but minting a **new** token.
   *
   * Reusing the old token would mean a resend does not invalidate the previous email —
   * so an intercepted first email stays usable. Throttled because an unthrottled resend
   * endpoint is an email-spam relay pointed at an address of the attacker's choosing.
   */
  async resend(publicId: string): Promise<void> {
    const tenantId = this.context.requireTenantId('resend invitation');

    const invitation = await this.dataSource
      .getRepository(UserInvitationEntity)
      .findOne({ where: { publicId, tenantId } });

    if (!invitation) throw new NotFoundError('Invitation', publicId);
    if (invitation.status !== 'PENDING') {
      throw new ValidationError(`This invitation is ${invitation.status.toLowerCase()}`);
    }
    if (invitation.resentCount >= MAX_RESENDS) {
      throw new ValidationError('This invitation has been resent too many times');
    }
    if (
      invitation.lastSentAt &&
      Date.now() - invitation.lastSentAt.getTime() < RESEND_COOLDOWN_MINUTES * 60_000
    ) {
      throw new ValidationError(
        `Please wait ${RESEND_COOLDOWN_MINUTES} minutes between resends`,
      );
    }

    const plaintext = this.crypto.generateToken(32);

    await this.dataSource.query(
      `UPDATE user_invitations
          SET token_hash = ?, resent_count = resent_count + 1,
              last_sent_at = NOW(3), expires_at = DATE_ADD(NOW(3), INTERVAL ? DAY)
        WHERE id = ?`,
      [this.crypto.hashToken(plaintext), INVITATION_TTL_DAYS, invitation.id],
    );

    const tenant = await this.dataSource
      .getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });

    await this.mail.sendStaffInvitation(
      invitation.email,
      'A colleague',
      tenant?.businessName ?? 'the store',
      plaintext,
    );
  }

  async revoke(publicId: string): Promise<void> {
    const tenantId = this.context.requireTenantId('revoke invitation');

    const result = (await this.dataSource.query(
      `UPDATE user_invitations
          SET status = 'REVOKED', revoked_at = NOW(3)
        WHERE public_id = ? AND tenant_id = ? AND status = 'PENDING'`,
      [publicId, tenantId],
    )) as { affectedRows: number };

    // 404 rather than 403 or a silent success: confirming the id exists would let a
    // caller probe another tenant's invitations.
    if (result.affectedRows === 0) throw new NotFoundError('Invitation', publicId);
  }

  async list(status?: string): Promise<InvitationResponse[]> {
    const tenantId = this.context.requireTenantId('list invitations');

    const rows = (await this.dataSource.query(
      `SELECT i.public_id AS publicId, i.email, i.first_name AS firstName,
              i.last_name AS lastName, i.role_ids AS roleIds, i.store_id AS storeId,
              i.status, i.expires_at AS expiresAt, i.accepted_at AS acceptedAt,
              i.resent_count AS resentCount, i.created_at AS createdAt,
              u.first_name AS inviterFirst, u.last_name AS inviterLast
         FROM user_invitations i
         LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.tenant_id = ?
          ${status ? 'AND i.status = ?' : ''}
        ORDER BY i.created_at DESC
        LIMIT 200`,
      status ? [tenantId, status] : [tenantId],
    )) as Record<string, unknown>[];

    const allRoleIds = new Set<number>();
    for (const row of rows) {
      for (const id of parseRoleIds(row['roleIds'])) allRoleIds.add(id);
    }

    const roleCodeById = new Map<number, string>();
    if (allRoleIds.size > 0) {
      const roles = await this.dataSource
        .getRepository(RoleEntity)
        .find({ where: { id: In([...allRoleIds]) } });
      for (const role of roles) roleCodeById.set(role.id, role.code);
    }

    return rows.map((row) => ({
      id: String(row['publicId']),
      email: String(row['email']),
      firstName: (row['firstName'] as string | null) ?? null,
      lastName: (row['lastName'] as string | null) ?? null,
      roles: parseRoleIds(row['roleIds']).map((id) => roleCodeById.get(id) ?? `role:${id}`),
      storeId: row['storeId'] ? String(row['storeId']) : null,
      status: row['status'] as InvitationResponse['status'],
      invitedBy: row['inviterFirst']
        ? `${String(row['inviterFirst'])} ${String(row['inviterLast'] ?? '')}`.trim()
        : null,
      expiresAt: toIso(row['expiresAt']),
      acceptedAt: row['acceptedAt'] ? toIso(row['acceptedAt']) : null,
      resentCount: Number(row['resentCount'] ?? 0),
      createdAt: toIso(row['createdAt']),
    }));
  }

  // -------------------------------------------------------------------------
  // Accept
  // -------------------------------------------------------------------------

  /**
   * Preview shown on the accept page, before the invitee has an account.
   *
   * Reachable with only a token, so it exposes the minimum needed to make the page
   * meaningful — never the inviter's email, the tenant id, or any staff list.
   */
  async preview(token: string): Promise<InvitationPreview> {
    const rows = (await this.dataSource.query(
      `SELECT i.email, i.role_ids AS roleIds, i.expires_at AS expiresAt,
              t.business_name AS storeName,
              u.first_name AS inviterFirst, u.last_name AS inviterLast
         FROM user_invitations i
         JOIN tenants t ON t.id = i.tenant_id
         LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.token_hash = ?
          AND i.status = 'PENDING'
          AND i.revoked_at IS NULL
          AND i.expires_at > NOW(3)
        LIMIT 1`,
      [this.crypto.hashToken(token)],
    )) as Record<string, unknown>[];

    const row = rows[0];
    if (!row) throw new NotFoundError('Invitation');

    const roleIds = parseRoleIds(row['roleIds']);
    const roles = await this.dataSource
      .getRepository(RoleEntity)
      .find({ where: { id: In(roleIds.length > 0 ? roleIds : [0]) } });

    return {
      email: String(row['email']),
      storeName: String(row['storeName']),
      roles: roles.map((role) => role.name),
      invitedByName: row['inviterFirst']
        ? `${String(row['inviterFirst'])} ${String(row['inviterLast'] ?? '')}`.trim()
        : null,
      expiresAt: toIso(row['expiresAt']),
    };
  }

  /**
   * Creates the account and applies the grants.
   *
   * One transaction, with the invitation claimed by a **conditional UPDATE** first so two
   * concurrent submissions of the same link cannot both create a user. The account is
   * created already-verified: possession of the emailed token is itself proof of control
   * over that mailbox, so a second verification round-trip would be ceremony.
   */
  async accept(input: AcceptInvitationRequest): Promise<{ userPublicId: string; tenantSlug: string }> {
    const tokenHash = this.crypto.hashToken(input.token);
    const passwordHash = await this.hash.hash(input.password);

    const result = await this.dataSource.transaction(async (manager) => {
      const claim = (await manager.query(
        `UPDATE user_invitations
            SET status = 'ACCEPTED', accepted_at = NOW(3)
          WHERE token_hash = ?
            AND status = 'PENDING'
            AND revoked_at IS NULL
            AND expires_at > NOW(3)`,
        [tokenHash],
      )) as { affectedRows: number };

      if (claim.affectedRows !== 1) {
        throw new NotFoundError('Invitation');
      }

      const rows = (await manager.query(
        `SELECT id, tenant_id AS tenantId, email, email_normalized AS emailNormalized,
                role_ids AS roleIds, store_id AS storeId
           FROM user_invitations WHERE token_hash = ? LIMIT 1`,
        [tokenHash],
      )) as Record<string, unknown>[];

      const invitation = rows[0]!;
      const tenantId = String(invitation['tenantId']);

      const user = await manager.save(
        manager.create(UserEntity, {
          publicId: newPublicId(),
          tenantId,
          userType: 'TENANT',
          email: String(invitation['email']),
          emailNormalized: String(invitation['emailNormalized']),
          passwordHash,
          passwordAlgo: 'bcrypt',
          passwordChangedAt: new Date(),
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          phoneE164: input.phone ?? null,
          status: 'ACTIVE',
          // Holding the token proves mailbox control — no separate verification needed.
          emailVerifiedAt: new Date(),
        }),
      );

      // Roles are re-validated rather than trusted from the snapshot: a role could have
      // been deleted, or (worse) its id reused, between invite and acceptance.
      const roleIds = parseRoleIds(invitation['roleIds']);
      const validRoles = await manager.find(RoleEntity, {
        where: [
          { id: In(roleIds.length > 0 ? roleIds : [0]), tenantId: IsNull() },
          { id: In(roleIds.length > 0 ? roleIds : [0]), tenantId },
        ],
      });

      // A platform-scoped role must never be grantable through a tenant invitation —
      // that would be a privilege-escalation path from merchant to platform admin.
      const grantable = validRoles.filter((role) => role.scope === 'TENANT');

      for (const role of grantable) {
        await manager.save(
          manager.create(UserRoleEntity, {
            userId: user.id,
            roleId: role.id,
            storeId: (invitation['storeId'] as string | null) ?? null,
          }),
        );
      }

      await manager.query(`UPDATE user_invitations SET accepted_user_id = ? WHERE id = ?`, [
        user.id,
        invitation['id'],
      ]);

      const tenant = await manager.findOne(TenantEntity, { where: { id: tenantId } });

      return { user, tenantSlug: tenant?.slug ?? '', tenantId, granted: grantable.length };
    });

    // Invalidate cached authorization for the tenant — the staff list just changed.
    await this.permissions.invalidate(result.tenantId);

    this.authLog.record({
      event: 'INVITATION_ACCEPTED',
      userId: result.user.id,
      tenantId: result.tenantId,
      identifier: result.user.email,
      detail: { rolesGranted: result.granted },
    });

    return { userPublicId: result.user.publicId, tenantSlug: result.tenantSlug };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Resolves role codes to rows, accepting system roles and this tenant's own.
   *
   * Rejects `PLATFORM`-scoped roles outright: without this check a merchant could invite
   * someone as `PLATFORM_SUPER_ADMIN` and grant cross-tenant access to the whole platform.
   */
  private async resolveRoles(codes: string[], tenantId: string): Promise<RoleEntity[]> {
    const roles = await this.dataSource.getRepository(RoleEntity).find({
      where: [
        { code: In(codes), tenantId: IsNull() },
        { code: In(codes), tenantId },
      ],
    });

    const tenantScoped = roles.filter((role) => role.scope === 'TENANT');

    const found = new Set(tenantScoped.map((role) => role.code));
    const missing = codes.filter((code) => !found.has(code));
    if (missing.length > 0) {
      throw new ValidationError(`Unknown or not assignable role: ${missing.join(', ')}`, {
        field: 'roleCodes',
        missing,
      });
    }

    return tenantScoped;
  }

  private toResponse(
    invitation: UserInvitationEntity,
    roleCodes: string[],
    inviter: UserEntity | null,
  ): InvitationResponse {
    return {
      id: invitation.publicId,
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      roles: roleCodes,
      storeId: invitation.storeId,
      status: invitation.status,
      invitedBy: inviter?.fullName ?? null,
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      resentCount: invitation.resentCount,
      createdAt: invitation.createdAt.toISOString(),
    };
  }
}

/** MySQL returns a JSON column as a string on some driver paths and parsed on others. */
function parseRoleIds(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}
