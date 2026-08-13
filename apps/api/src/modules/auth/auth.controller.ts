import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  mfaConfirmRequestSchema,
  mfaDisableRequestSchema,
  mfaVerifyRequestSchema,
  registerRequestSchema,
  requestOtpSchema,
  resendVerificationRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
  verifyOtpSchema,
  type LoginResponse,
} from '@ems/contracts';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, type AuthenticatedUser } from '../../common/decorators';
import { AuthTokenMissingError } from '../../common/errors/api.errors';
import { AuthService } from './services/auth.service';
import { MfaService } from './services/mfa.service';
import { OtpService } from './services/otp.service';
import { TokenService } from './services/token.service';
import { REFRESH_COOKIE_NAME, buildRefreshCookieOptions, clearRefreshCookie } from './cookies';

/**
 * Authentication endpoints.
 *
 * The refresh token is only ever set and read as an **httpOnly cookie**. It is never in
 * a response body and never in a request body, so no client script can read it — which
 * is what stops a single compromised frontend dependency from exfiltrating a 30-day
 * credential. The access token, being short-lived and held in memory, is returned in
 * the body.
 */
@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  // -------------------------------------------------------------------------
  // Registration & verification
  // -------------------------------------------------------------------------

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a merchant account and its tenant' })
  async register(@Body(new ZodValidationPipe(registerRequestSchema)) body: unknown) {
    const input = body as Parameters<AuthService['register']>[0];
    const result = await this.auth.register(input);

    return {
      userId: result.userPublicId,
      tenantSlug: result.tenantSlug,
      message: 'Account created. Check your email to verify your address.',
    };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume an email-verification token' })
  async verifyEmail(@Body(new ZodValidationPipe(verifyEmailRequestSchema)) body: { token: string }) {
    await this.auth.verifyEmail(body.token);
    return { message: 'Email verified. You can now sign in.' };
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the verification email' })
  async resendVerification(
    @Body(new ZodValidationPipe(resendVerificationRequestSchema)) body: { email: string },
  ) {
    await this.auth.resendVerification(body.email);
    // Identical whether or not the account exists — see AuthService.resendVerification.
    return { message: 'If that address needs verification, we have sent a new link.' };
  }

  // -------------------------------------------------------------------------
  // Login / refresh / logout
  // -------------------------------------------------------------------------

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: Parameters<AuthService['login']>[0],
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(body);

    if (result.refreshToken && result.refreshExpiresAt) {
      response.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        buildRefreshCookieOptions(result.refreshExpiresAt),
      );
    }

    return result.response;
  }

  /**
   * Rotates the refresh cookie and returns a new access token.
   *
   * `@Public()` because the caller's access token is expired by definition — that is
   * why they are here. Authentication comes from the refresh cookie instead.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange the refresh cookie for a new access token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const refreshToken = readRefreshCookie(request);
    if (!refreshToken) throw new AuthTokenMissingError();

    try {
      const result = await this.auth.refresh(refreshToken);

      if (result.refreshToken && result.refreshExpiresAt) {
        response.cookie(
          REFRESH_COOKIE_NAME,
          result.refreshToken,
          buildRefreshCookieOptions(result.refreshExpiresAt),
        );
      }

      return result.response;
    } catch (error) {
      // Clear the cookie on any failure. Leaving a dead token in the browser makes
      // every subsequent page load retry a refresh that cannot succeed.
      response.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookie());
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = readRefreshCookie(request);

    // Read from the access token if one was supplied, so the current access token can
    // be denylisted too rather than staying valid for up to 10 more minutes.
    const authorization = request.headers.authorization;
    let jti: string | undefined;
    let expiresAt: Date | undefined;

    if (authorization?.toLowerCase().startsWith('bearer ')) {
      const decoded = this.tokens.decodeUnsafe(authorization.slice(7).trim());
      if (decoded?.jti && typeof decoded.exp === 'number') {
        jti = String(decoded.jti);
        expiresAt = new Date(decoded.exp * 1_000);
      }
    }

    await this.auth.logout(refreshToken, jti, expiresAt);
    response.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookie());

    return { message: 'Signed out.' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every session for the current user' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const revoked = await this.auth.logoutAll(user.id);
    response.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookie());
    return { message: `Signed out of ${revoked} session${revoked === 1 ? '' : 's'}.` };
  }

  // -------------------------------------------------------------------------
  // Current user
  // -------------------------------------------------------------------------

  @Get('me')
  @ApiOperation({ summary: 'The authenticated user, roles and permissions' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const entity = await this.auth.findByEmailOrId(user.id);
    return this.auth.toUserSummary(entity);
  }

  // -------------------------------------------------------------------------
  // Password
  // -------------------------------------------------------------------------

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password-reset link' })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: { email: string },
  ) {
    await this.auth.requestPasswordReset(body.email);
    // Byte-identical regardless of whether the account exists.
    return { message: 'If an account exists for that address, a reset link is on its way.' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema))
    body: { token: string; password: string },
  ) {
    await this.auth.resetPassword(body.token, body.password);
    return { message: 'Password updated. All other sessions were signed out.' };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change your password (revokes all sessions)' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordRequestSchema))
    body: { currentPassword: string; newPassword: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
    response.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookie());
    return { message: 'Password changed. Please sign in again.' };
  }

  // -------------------------------------------------------------------------
  // OTP
  // -------------------------------------------------------------------------

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a one-time passcode' })
  async requestOtp(
    @Body(new ZodValidationPipe(requestOtpSchema))
    body: { purpose: 'LOGIN' | 'PHONE_VERIFY' | 'EMAIL_VERIFY' | 'TRANSACTION'; email?: string; phone?: string },
  ) {
    const identifier = body.email ?? body.phone!;
    const user = body.email ? await this.auth.findByEmail(body.email) : null;

    await this.otp.request(body.purpose, identifier, user?.id, user?.tenantId ?? null);

    return { message: 'If that account exists, a code has been sent.' };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a one-time passcode and sign in' })
  async verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema))
    body: {
      purpose: 'LOGIN' | 'PHONE_VERIFY' | 'EMAIL_VERIFY' | 'TRANSACTION';
      email?: string;
      phone?: string;
      code: string;
    },
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const identifier = body.email ?? body.phone!;
    const { userId } = await this.otp.verify(body.purpose, identifier, body.code);

    if (!userId) throw new AuthTokenMissingError();

    const user = await this.auth.findByEmailOrId(userId);
    const result = await this.auth.completeLogin(user);

    if (result.refreshToken && result.refreshExpiresAt) {
      response.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        buildRefreshCookieOptions(result.refreshExpiresAt),
      );
    }

    return result.response;
  }

  // -------------------------------------------------------------------------
  // MFA
  // -------------------------------------------------------------------------

  @Post('mfa/enrol')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin TOTP enrolment (returns a QR code)' })
  async enrolMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.mfa.beginEnrolment(user.id);
  }

  @Post('mfa/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm TOTP enrolment and receive recovery codes' })
  async confirmMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(mfaConfirmRequestSchema)) body: { code: string },
  ) {
    return this.mfa.confirmEnrolment(user.id, body.code);
  }

  /**
   * Completes a login that stopped at the MFA challenge.
   *
   * `@Public()` because the caller holds an MFA challenge token, not an access token —
   * `JwtAuthGuard` would reject `typ: 'mfa'` on a protected route, which is exactly the
   * behaviour we want everywhere else.
   */
  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a second factor and complete sign-in' })
  async verifyMfa(
    @Body(new ZodValidationPipe(mfaVerifyRequestSchema))
    body: { mfaToken: string; code: string; method: 'TOTP' | 'RECOVERY_CODE' },
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const claims = this.tokens.verifyMfaChallengeToken(body.mfaToken);

    const valid =
      body.method === 'RECOVERY_CODE'
        ? await this.mfa.verifyRecoveryCode(claims.uid, body.code)
        : await this.mfa.verifyTotp(claims.uid, body.code);

    if (!valid) throw new AuthTokenMissingError();

    const user = await this.auth.findByEmailOrId(claims.uid);
    const result = await this.auth.completeLogin(user);

    if (result.refreshToken && result.refreshExpiresAt) {
      response.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        buildRefreshCookieOptions(result.refreshExpiresAt),
      );
    }

    return result.response;
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable TOTP (requires password and a current code)' })
  async disableMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(mfaDisableRequestSchema)) body: { password: string; code: string },
  ) {
    await this.mfa.disable(user.id, body.password, body.code);
    return { message: 'Two-factor authentication disabled. Please sign in again.' };
  }
}

function readRefreshCookie(request: Request): string | undefined {
  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE_NAME];
}
