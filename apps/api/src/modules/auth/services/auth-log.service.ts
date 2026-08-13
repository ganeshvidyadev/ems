import { Injectable } from '@nestjs/common';
import { UAParser } from 'ua-parser-js';
import { LogBufferService } from '../../logging/log-buffer.service';
import { RequestContextService } from '../../../common/services/request-context.service';

export type AuthEvent =
  | 'REGISTER'
  | 'EMAIL_VERIFIED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED_LOCKED'
  | 'LOGIN_BLOCKED_UNVERIFIED'
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'TOKEN_REFRESHED'
  | 'TOKEN_REUSE_DETECTED'
  | 'ACCOUNT_LOCKED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'PASSWORD_CHANGED'
  | 'OTP_SENT'
  | 'OTP_VERIFIED'
  | 'OTP_FAILED'
  | 'MFA_ENROLLED'
  | 'MFA_CHALLENGE'
  | 'MFA_VERIFIED'
  | 'MFA_FAILED'
  | 'MFA_DISABLED'
  | 'MFA_RECOVERY_CODE_USED'
  | 'SESSION_REVOKED'
  | 'INVITATION_SENT'
  | 'INVITATION_ACCEPTED'
  | 'PERMISSION_DENIED';

export interface AuthLogInput {
  event: AuthEvent;
  userId?: string | null;
  tenantId?: string | null;
  /** Email or phone as supplied. Recorded even when no account matched. */
  identifier?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** 0–100. Only meaningful signals get a high score — see `riskFor`. */
  riskScore?: number;
  detail?: Record<string, unknown>;
}

/**
 * Writes to the `auth_logs` collection (365-day TTL — docs/02 §20).
 *
 * Kept 365 days, unlike `api_logs` at 30, because breach investigations look back
 * months: "when did this account first get accessed from that address" is
 * unanswerable if the trail is three weeks deep.
 *
 * The identifier is recorded even for failed attempts against **non-existent**
 * accounts. That is the data that makes credential-stuffing visible — the pattern is
 * hundreds of distinct identifiers from one IP, which is invisible if only real
 * accounts are logged.
 *
 * Goes through the same non-blocking buffered writer as request logs, so a login is
 * never slowed or failed by a logging problem.
 */
@Injectable()
export class AuthLogService {
  private readonly uaParser = new UAParser();

  constructor(
    private readonly buffer: LogBufferService,
    private readonly context: RequestContextService,
  ) {}

  record(input: AuthLogInput): void {
    const ctx = this.context.get();
    const userAgent = input.userAgent ?? ctx?.userAgent ?? null;

    this.buffer.enqueue('auth_logs', {
      event: input.event,
      // Numeric ids so Mongo can range/aggregate on them; string ids would sort
      // lexicographically and break "top N users by failed logins".
      userId: input.userId ? Number(input.userId) : null,
      tenantId: input.tenantId ? Number(input.tenantId) : (ctx?.tenantId ? Number(ctx.tenantId) : null),
      identifier: input.identifier ? maskIdentifier(input.identifier) : null,
      // Unmasked hash so repeated attempts against the same address can be counted
      // without the log itself becoming a list of harvested emails.
      identifierHash: input.identifier ? hashIdentifier(input.identifier) : null,
      ip: input.ip ?? ctx?.ip ?? null,
      correlationId: ctx?.correlationId ?? null,
      surface: ctx?.surface ?? 'console',
      device: this.parseDevice(userAgent),
      deviceFingerprint: userAgent ? hashIdentifier(userAgent) : null,
      riskScore: input.riskScore ?? riskFor(input.event),
      detail: input.detail ?? null,
      createdAt: new Date(),
    });
  }

  private parseDevice(userAgent: string | null): Record<string, unknown> | null {
    if (!userAgent) return null;
    this.uaParser.setUA(userAgent);
    const result = this.uaParser.getResult();
    return {
      browser: result.browser.name ?? null,
      browserVersion: result.browser.version ?? null,
      os: result.os.name ?? null,
      osVersion: result.os.version ?? null,
      type: result.device.type ?? 'desktop',
    };
  }

  /**
   * Human-readable device label for the sessions UI ("Chrome on Windows").
   *
   * Users cannot identify a session from a raw user-agent string, and a sessions list
   * nobody can interpret is a sessions list nobody uses to spot an intruder.
   */
  deviceLabel(userAgent: string | null | undefined): string | null {
    if (!userAgent) return null;
    this.uaParser.setUA(userAgent);
    const result = this.uaParser.getResult();

    const browser = result.browser.name;
    const os = result.os.name;

    if (browser && os) return `${browser} on ${os}`;
    if (browser) return browser;
    if (os) return os;
    return null;
  }
}

/** `alice@example.com` → `a***e@example.com`. Enough to recognise, not to harvest. */
function maskIdentifier(identifier: string): string {
  const atIndex = identifier.lastIndexOf('@');

  if (atIndex > 0) {
    const local = identifier.slice(0, atIndex);
    const domain = identifier.slice(atIndex);
    if (local.length <= 2) return `${local[0] ?? ''}***${domain}`;
    return `${local[0]}***${local[local.length - 1]}${domain}`;
  }

  // Phone number: keep the last four, which is the convention users expect.
  if (identifier.length > 4) return `***${identifier.slice(-4)}`;
  return '***';
}

/** Stable non-reversible key for grouping attempts by target. */
function hashIdentifier(value: string): string {
  let hash = 0x811c9dc5;
  const normalized = value.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Default risk score per event.
 *
 * Scores exist so an alerting rule can be written once ("page on riskScore >= 90")
 * rather than enumerating event names it will inevitably fall behind on.
 * `TOKEN_REUSE_DETECTED` is 100 because it is the only event here that is near-proof
 * of a stolen credential rather than a user error.
 */
function riskFor(event: AuthEvent): number {
  switch (event) {
    case 'TOKEN_REUSE_DETECTED':
      return 100;
    case 'ACCOUNT_LOCKED':
      return 80;
    case 'MFA_RECOVERY_CODE_USED':
      return 60;
    case 'MFA_FAILED':
    case 'LOGIN_BLOCKED_LOCKED':
      return 50;
    case 'LOGIN_FAILED':
    case 'OTP_FAILED':
    case 'PERMISSION_DENIED':
      return 30;
    case 'PASSWORD_RESET_REQUESTED':
    case 'PASSWORD_CHANGED':
    case 'MFA_DISABLED':
      return 25;
    default:
      return 0;
  }
}
