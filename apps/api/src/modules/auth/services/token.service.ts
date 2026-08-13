import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newPublicId } from '@ems/kernel';
import { createPublicKey, createHash } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import type { JwtConfig } from '../../../config/configuration';
import {
  AuthTokenExpiredError,
  AuthTokenInvalidError,
} from '../../../common/errors/api.errors';

/** Claims carried by an access token. */
export interface AccessTokenClaims {
  /** User public id (ULID) — never the numeric PK, which would leak row counts. */
  sub: string;
  /** Internal numeric user id, so guards need no extra lookup on the hot path. */
  uid: string;
  /** Tenant id. NULL for platform staff. THE tenant signal for console routes. */
  tid: string | null;
  /** Store scope, when the session is bound to one store of a multi-store tenant. */
  sid?: string | null;
  typ: 'access' | 'storefront' | 'mfa';
  userType: 'PLATFORM' | 'TENANT';
  /** Role codes, for display and coarse checks. Authorization uses `perms`. */
  roles: string[];
  /**
   * Resolved permission codes.
   *
   * Embedded rather than looked up per request: a DB round-trip for permissions on
   * every call is the single biggest avoidable cost in an authenticated API. The
   * trade-off is staleness bounded by the 10-minute access-token lifetime — a
   * revoked permission keeps working until the token expires. For genuinely urgent
   * revocation the token is added to the denylist, which is checked every request.
   */
  perms: string[];
  planCode?: string | null;
  /** Token id — the denylist key. */
  jti: string;
  /** Refresh-token family, so revoking a family can also match live access tokens. */
  fam?: string;
}

export interface MfaChallengeClaims {
  sub: string;
  uid: string;
  tid: string | null;
  typ: 'mfa';
  jti: string;
}

export interface SignedToken {
  token: string;
  jti: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

/**
 * Issues and verifies JWTs.
 *
 * **RS256, not HS256.** With a shared secret, every service that *verifies* a token
 * can also *mint* one — so the storefront process and every queue worker would hold
 * signing power, and a compromise anywhere becomes a compromise everywhere.
 * Asymmetric keys let verifiers hold only the public half.
 *
 * The `kid` header plus a JWKS endpoint is what makes rotation possible without a
 * coordinated restart: a new key can be published and used for new tokens while
 * tokens signed by the previous key still verify until they expire.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly config: JwtConfig;
  private readonly publicKeyPem: string;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<JwtConfig>('jwt');

    // Derived from the private key rather than trusting two separate env vars to
    // agree. A mismatched pair produces tokens nothing can verify, and the failure
    // is baffling at runtime — this makes it impossible.
    this.publicKeyPem = createPublicKey(this.config.privateKey)
      .export({ type: 'spki', format: 'pem' })
      .toString();
  }

  // -------------------------------------------------------------------------
  // Signing
  // -------------------------------------------------------------------------

  signAccessToken(claims: Omit<AccessTokenClaims, 'jti' | 'typ'> & { typ?: 'access' }): SignedToken {
    const jti = newPublicId();
    const expiresInSeconds = parseDuration(this.config.accessTtl);

    const token = jwt.sign(
      { ...claims, typ: 'access', jti },
      this.config.privateKey,
      {
        algorithm: 'RS256',
        expiresIn: expiresInSeconds,
        issuer: this.config.issuer,
        audience: this.config.audience,
        keyid: this.config.keyId,
      },
    );

    return {
      token,
      jti,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
      expiresInSeconds,
    };
  }

  /**
   * Short-lived, single-purpose token issued after password verification but before
   * the MFA code is checked.
   *
   * Deliberately **not** an access token: it carries no permissions and `typ: 'mfa'`,
   * so `JwtAuthGuard` rejects it everywhere except the MFA-verify endpoint. Issuing a
   * real access token at this point would make MFA decorative — the caller would
   * already be authenticated.
   */
  signMfaChallengeToken(claims: Omit<MfaChallengeClaims, 'jti' | 'typ'>): SignedToken {
    const jti = newPublicId();
    // Five minutes: long enough to open an authenticator app, short enough that a
    // captured challenge token is near-useless.
    const expiresInSeconds = 300;

    const token = jwt.sign({ ...claims, typ: 'mfa', jti }, this.config.privateKey, {
      algorithm: 'RS256',
      expiresIn: expiresInSeconds,
      issuer: this.config.issuer,
      audience: this.config.audience,
      keyid: this.config.keyId,
    });

    return {
      token,
      jti,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
      expiresInSeconds,
    };
  }

  signStorefrontToken(claims: {
    sub: string;
    uid: string;
    tid: string;
    sid?: string | null;
  }): SignedToken {
    const jti = newPublicId();
    const expiresInSeconds = parseDuration(this.config.storefrontTtl);

    const token = jwt.sign(
      { ...claims, typ: 'storefront', userType: 'TENANT', roles: [], perms: [], jti },
      this.config.privateKey,
      {
        algorithm: 'RS256',
        expiresIn: expiresInSeconds,
        issuer: this.config.issuer,
        audience: this.config.audience,
        keyid: this.config.keyId,
      },
    );

    return {
      token,
      jti,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
      expiresInSeconds,
    };
  }

  // -------------------------------------------------------------------------
  // Verification
  // -------------------------------------------------------------------------

  /**
   * Verifies signature, expiry, issuer and audience.
   *
   * `algorithms` is pinned to RS256. Without it, `jsonwebtoken` would accept
   * whatever the token's own header declares — including `none`, and historically
   * an HMAC token verified against the RSA *public* key. Both are complete auth
   * bypasses, and both are why the allowlist is not optional.
   */
  verifyAccessToken(token: string): AccessTokenClaims {
    const payload = this.verify(token);

    if (payload.typ !== 'access' && payload.typ !== 'storefront') {
      // An MFA challenge token presented as an access token is the attack this stops.
      throw new AuthTokenInvalidError('Token is not valid for API access');
    }

    return payload as unknown as AccessTokenClaims;
  }

  verifyMfaChallengeToken(token: string): MfaChallengeClaims {
    const payload = this.verify(token);

    if (payload.typ !== 'mfa') {
      throw new AuthTokenInvalidError('Token is not an MFA challenge token');
    }

    return payload as unknown as MfaChallengeClaims;
  }

  private verify(token: string): jwt.JwtPayload {
    try {
      const payload = jwt.verify(token, this.publicKeyPem, {
        algorithms: ['RS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        // Small leeway for clock skew between our own hosts. Larger values would
        // extend the usable life of a revoked token.
        clockTolerance: 5,
      });

      if (typeof payload === 'string') {
        throw new AuthTokenInvalidError('Token payload is not an object');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) throw new AuthTokenExpiredError();
      if (error instanceof jwt.JsonWebTokenError) {
        // The library's message can name the failure mode precisely ("invalid
        // signature"); that detail is diagnostic for an attacker and useless to a
        // legitimate client, so it is logged and not returned.
        this.logger.debug(`JWT verification failed: ${error.message}`);
        throw new AuthTokenInvalidError();
      }
      throw error;
    }
  }

  /** Decodes without verifying — only for reading `jti`/`exp` off an expired token. */
  decodeUnsafe(token: string): jwt.JwtPayload | null {
    const decoded = jwt.decode(token);
    return decoded && typeof decoded !== 'string' ? decoded : null;
  }

  // -------------------------------------------------------------------------
  // JWKS
  // -------------------------------------------------------------------------

  /**
   * Public key in JWKS form.
   *
   * Serving this lets the storefront, workers, and any future service verify tokens
   * without being given the private key — the whole point of choosing RS256.
   */
  getJwks(): { keys: Record<string, string>[] } {
    const keyObject = createPublicKey(this.publicKeyPem);
    const jwk = keyObject.export({ format: 'jwk' }) as { n?: string; e?: string; kty?: string };

    return {
      keys: [
        {
          kty: jwk.kty ?? 'RSA',
          n: jwk.n ?? '',
          e: jwk.e ?? 'AQAB',
          alg: 'RS256',
          use: 'sig',
          kid: this.config.keyId,
        },
      ],
    };
  }

  get keyId(): string {
    return this.config.keyId;
  }

  get accessTtlSeconds(): number {
    return parseDuration(this.config.accessTtl);
  }

  get refreshTtlSeconds(): number {
    return parseDuration(this.config.refreshTtl);
  }

  /** SHA-256 of a token — how refresh tokens and link tokens are stored. */
  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}

/** `10m` / `24h` / `30d` → seconds. Validated by the env schema, so a throw is a bug. */
export function parseDuration(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);

  const amount = Number(match[1]);
  switch (match[2]) {
    case 'ms':
      return Math.ceil(amount / 1_000);
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3_600;
    case 'd':
      return amount * 86_400;
    default:
      throw new Error(`Invalid duration unit in: ${value}`);
  }
}
