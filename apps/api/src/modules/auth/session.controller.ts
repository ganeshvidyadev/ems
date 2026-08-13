import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotFoundError } from '@ems/kernel';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators';
import { RefreshTokenService } from './services/refresh-token.service';
import { AuthLogService } from './services/auth-log.service';

/**
 * Session management.
 *
 * This exists because it is the only way a user can *notice* a compromise themselves.
 * A stolen refresh token is otherwise invisible — reuse detection catches replay, but a
 * thief who simply refreshes on schedule looks exactly like a second browser. Showing
 * "Chrome on Windows, from 203.0.113.9" and offering a revoke button turns that into
 * something a person can act on.
 *
 * Sessions are keyed by **family**, not by token row: rotation creates a row on every
 * refresh, so listing rows would show one browser as dozens of devices.
 */
@ApiTags('auth')
@Controller({ path: 'auth/sessions', version: '1' })
export class SessionController {
  constructor(
    private readonly refreshTokens: RefreshTokenService,
    private readonly authLog: AuthLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active sessions for the current user' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const sessions = await this.refreshTokens.listActiveSessions(user.id);

    return sessions.map((session) => ({
      // The family id is the stable handle a client uses to revoke, and it is not a
      // credential — the token hash is never exposed.
      id: session.familyId,
      deviceLabel: session.deviceLabel,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt?.toISOString?.() ?? null,
      lastUsedAt: session.lastUsedAt?.toISOString?.() ?? null,
      expiresAt: session.expiresAt?.toISOString?.() ?? null,
      // Lets the UI label "This device" and avoid offering a confusing self-revoke.
      isCurrent: user.familyId === session.familyId,
    }));
  }

  @Delete(':familyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke one session' })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
  ) {
    // Ownership is verified before revoking. Without this check, any authenticated user
    // could pass another user's family id and sign them out — a trivial denial of
    // service against a specific account.
    const sessions = await this.refreshTokens.listActiveSessions(user.id);
    const owned = sessions.some((session) => session.familyId === familyId);

    // 404, not 403: confirming that a family id exists would let someone enumerate
    // other users' sessions.
    if (!owned) throw new NotFoundError('Session', familyId);

    await this.refreshTokens.revokeFamily(familyId, 'ADMIN_REVOKED');

    this.authLog.record({
      event: 'SESSION_REVOKED',
      userId: user.id,
      tenantId: user.tenantId,
      detail: { familyId, self: user.familyId === familyId },
    });

    return { message: 'Session revoked.' };
  }
}
