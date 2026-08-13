import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '@ems/kernel';
import { ErrorCode } from '@ems/contracts';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { CryptoService } from '../../../common/services/crypto.service';
import { MailService } from '../../notification/mail.service';
import { AuthLogService } from './auth-log.service';

export type OtpPurpose = 'LOGIN' | 'PHONE_VERIFY' | 'EMAIL_VERIFY' | 'TRANSACTION';

const CODE_TTL_SECONDS = 300;
/** Codes are 6 digits, so guessing must be capped well below 10^6 attempts. */
const MAX_VERIFY_ATTEMPTS = 5;
/** Resend throttle — an unthrottled OTP endpoint is an SMS-billing attack. */
const SEND_WINDOW_SECONDS = 3_600;
const MAX_SENDS_PER_WINDOW = 5;
const MIN_RESEND_INTERVAL_SECONDS = 60;

class OtpInvalidError extends DomainError {
  readonly code = ErrorCode.AUTH_OTP_INVALID;
}
class OtpExpiredError extends DomainError {
  readonly code = ErrorCode.AUTH_OTP_EXPIRED;
}
class OtpThrottledError extends DomainError {
  readonly code = ErrorCode.RATE_LIMIT_EXCEEDED;
}

interface OtpRecord {
  hash: string;
  attempts: string;
  sentAt: string;
  userId?: string;
}

/**
 * One-time passcodes, stored in Redis.
 *
 * Redis rather than MySQL because a code is worthless after five minutes: a TTL
 * expires it automatically, whereas a table needs a sweeper and accumulates dead rows.
 *
 * **Codes are hashed, never stored in plaintext.** A five-minute lifetime is not a
 * reason to skip it — Redis is dumped, replicated and inspected far more casually than
 * the primary store, and a plaintext OTP there is a live credential.
 *
 * Throttling is two-layered: a hard cap per hour, plus a minimum gap between sends.
 * The cap bounds cost; the gap stops a script from burning the whole quota in one
 * second and locking the real user out.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    private readonly authLog: AuthLogService,
  ) {}

  private codeKey(purpose: OtpPurpose, identifier: string): string {
    return `otp:${purpose}:${normalize(identifier)}`;
  }

  private throttleKey(identifier: string): string {
    return `otp:rl:${normalize(identifier)}`;
  }

  private lastSentKey(identifier: string): string {
    return `otp:last:${normalize(identifier)}`;
  }

  /**
   * Generates and sends a code.
   *
   * `userId` is optional and the method succeeds either way, so the caller can invoke
   * it for an unknown identifier without the response revealing that. Mail is only sent
   * when there is a real account.
   */
  async request(
    purpose: OtpPurpose,
    identifier: string,
    userId?: string,
    tenantId?: string | null,
  ): Promise<void> {
    await this.assertNotThrottled(identifier);

    const code = this.crypto.generateNumericCode(6);
    const record: OtpRecord = {
      hash: this.crypto.hashToken(code),
      attempts: '0',
      sentAt: String(Date.now()),
      ...(userId ? { userId } : {}),
    };

    const key = this.codeKey(purpose, identifier);
    await this.redis
      .pipeline()
      .del(key)
      .hset(key, record as unknown as Record<string, string>)
      .expire(key, CODE_TTL_SECONDS)
      .incr(this.throttleKey(identifier))
      .expire(this.throttleKey(identifier), SEND_WINDOW_SECONDS)
      .setex(this.lastSentKey(identifier), MIN_RESEND_INTERVAL_SECONDS, '1')
      .exec();

    // Only real accounts get mail; the caller's response is identical regardless.
    if (userId && identifier.includes('@')) {
      await this.mail.sendOtp(identifier, code, purpose);
    } else if (!userId) {
      this.logger.debug(`OTP requested for unknown identifier; nothing sent`);
    }

    this.authLog.record({
      event: 'OTP_SENT',
      userId: userId ?? null,
      tenantId: tenantId ?? null,
      identifier,
      detail: { purpose, delivered: Boolean(userId) },
    });
  }

  /**
   * Verifies a code and consumes it.
   *
   * The code is deleted on success, so a captured code cannot be replayed. On failure
   * the attempt counter increments and the record is deleted once the cap is reached —
   * forcing a fresh send rather than allowing unlimited guesses against one code.
   */
  async verify(
    purpose: OtpPurpose,
    identifier: string,
    code: string,
  ): Promise<{ userId?: string }> {
    const key = this.codeKey(purpose, identifier);
    const record = (await this.redis.hgetall(key)) as unknown as OtpRecord;

    if (!record || !record.hash) {
      this.authLog.record({
        event: 'OTP_FAILED',
        identifier,
        detail: { purpose, reason: 'no_active_code' },
      });
      throw new OtpExpiredError('This code has expired. Request a new one.');
    }

    const attempts = Number(record.attempts ?? '0');
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await this.redis.del(key);
      throw new OtpInvalidError('Too many incorrect attempts. Request a new code.');
    }

    // Constant-time: a `===` here would leak the code prefix through timing, which for
    // a 6-digit secret is enough to matter.
    const matches = this.crypto.safeEquals(this.crypto.hashToken(code), record.hash);

    if (!matches) {
      await this.redis.hincrby(key, 'attempts', 1);
      this.authLog.record({
        event: 'OTP_FAILED',
        userId: record.userId ?? null,
        identifier,
        detail: { purpose, attempt: attempts + 1 },
      });
      throw new OtpInvalidError('Incorrect code');
    }

    await this.redis.del(key);

    this.authLog.record({
      event: 'OTP_VERIFIED',
      userId: record.userId ?? null,
      identifier,
      detail: { purpose },
    });

    return { userId: record.userId };
  }

  private async assertNotThrottled(identifier: string): Promise<void> {
    const [recentSend, windowCount] = await Promise.all([
      this.redis.exists(this.lastSentKey(identifier)),
      this.redis.get(this.throttleKey(identifier)),
    ]);

    if (recentSend === 1) {
      throw new OtpThrottledError(
        `Please wait before requesting another code`,
        { retryAfterSeconds: MIN_RESEND_INTERVAL_SECONDS },
      );
    }

    if (Number(windowCount ?? '0') >= MAX_SENDS_PER_WINDOW) {
      throw new OtpThrottledError(
        `Too many codes requested. Try again later.`,
        { retryAfterSeconds: SEND_WINDOW_SECONDS },
      );
    }
  }
}

function normalize(identifier: string): string {
  return identifier.trim().toLowerCase();
}
