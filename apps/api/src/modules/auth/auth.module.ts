import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwksController } from './jwks.controller';
import { SessionController } from './session.controller';
import { AuthLogService } from './services/auth-log.service';
import { AuthService } from './services/auth.service';
import { AuthTokenService } from './services/auth-token.service';
import { MfaService } from './services/mfa.service';
import { OtpService } from './services/otp.service';
import { PermissionResolverService } from './services/permission-resolver.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { TokenDenylistService } from './services/token-denylist.service';
import { TokenService } from './services/token.service';
import { NotificationModule } from '../notification/notification.module';

/**
 * Authentication and authorization.
 *
 * `@Global()` because the globally-registered guards (`JwtAuthGuard`,
 * `PermissionsGuard`) depend on `TokenService`, `TokenDenylistService` and
 * `AuthLogService`. Guards registered via `APP_GUARD` resolve from the root injector, so
 * these providers have to be reachable there — the alternative is importing AuthModule
 * into every feature module, which is noise that carries no information.
 */
@Global()
@Module({
  imports: [NotificationModule],
  controllers: [AuthController, JwksController, SessionController],
  providers: [
    TokenService,
    TokenDenylistService,
    RefreshTokenService,
    AuthTokenService,
    AuthLogService,
    PermissionResolverService,
    OtpService,
    MfaService,
    AuthService,
  ],
  exports: [
    TokenService,
    TokenDenylistService,
    RefreshTokenService,
    AuthTokenService,
    AuthLogService,
    PermissionResolverService,
    AuthService,
  ],
})
export class AuthModule {}
