import { z } from 'zod';

/**
 * Environment contract, validated once at boot.
 *
 * The process **exits** on a bad or missing value rather than starting in a
 * half-configured state. A server that boots without `ENCRYPTION_KEY_BASE64` and
 * only fails when the first user enables MFA is far worse than one that refuses
 * to start: the failure surfaces in production, at the worst moment, to a user.
 *
 * There are deliberately no production defaults for secrets. A default secret is
 * indistinguishable from a configured one at runtime, which is how test keys
 * reach production.
 */

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const durationString = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/, 'Must be a duration such as 10m, 24h, 30d');

/**
 * Treats an empty string as absent.
 *
 * `.env` files cannot express "unset" — a commented-out line and `FOO=` look
 * different to a human but `FOO=` arrives as `''`, which then fails `.url()` or
 * `.min(1)` on a field that is genuinely optional. Every optional var goes through
 * this so a blank line in `.env.example` does not block startup.
 */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const base64Key = (minBytes: number, label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((v) => {
      try {
        return Buffer.from(v, 'base64').length >= minBytes;
      } catch {
        return false;
      }
    }, `${label} must be base64 encoding at least ${minBytes} bytes`);

export const envSchema = z
  .object({
    // --- Runtime ----------------------------------------------------------
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    APP_NAME: z.string().default('EMS'),
    APP_URL: z.string().url().default('http://localhost:3000'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_PREFIX: z.string().default('api'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // --- Platform domain --------------------------------------------------
    PLATFORM_ROOT_DOMAIN: z.string().min(3).default('ems.localhost'),
    CONSOLE_URL: z.string().url().default('http://localhost:3000'),
    STOREFRONT_URL: z.string().url().default('http://localhost:3001'),

    // --- MySQL ------------------------------------------------------------
    MYSQL_HOST: z.string().min(1),
    MYSQL_PORT: z.coerce.number().int().default(3306),
    MYSQL_DATABASE: z.string().min(1),
    MYSQL_USER: z.string().min(1),
    MYSQL_PASSWORD: z.string(),
    MYSQL_REPLICA_HOST: optional(z.string()),
    MYSQL_POOL_SIZE: z.coerce.number().int().min(2).max(500).default(20),
    MYSQL_LOGGING: booleanFromString.default('false'),

    // --- MongoDB ----------------------------------------------------------
    MONGO_URI: z.string().min(1).startsWith('mongodb'),
    MONGO_DATABASE: z.string().default('ems_logs'),

    // --- Redis ------------------------------------------------------------
    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.coerce.number().int().default(6379),
    REDIS_PASSWORD: optional(z.string()),
    REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
    REDIS_KEY_PREFIX: z.string().min(1).default('dev'),

    // Separate BullMQ instance — see the comment on the redis-queue service in
    // docker-compose.yml. Defaults fall back to the cache instance so a minimal
    // .env still boots, at the cost of the eviction-policy warning.
    REDIS_QUEUE_HOST: optional(z.string()),
    REDIS_QUEUE_PORT: optional(z.coerce.number().int()),
    REDIS_QUEUE_PASSWORD: optional(z.string()),
    REDIS_QUEUE_DB: z.coerce.number().int().min(0).max(15).default(0),

    // --- JWT --------------------------------------------------------------
    JWT_PRIVATE_KEY_BASE64: base64Key(1, 'JWT_PRIVATE_KEY_BASE64'),
    JWT_PUBLIC_KEY_BASE64: base64Key(1, 'JWT_PUBLIC_KEY_BASE64'),
    JWT_KEY_ID: z.string().min(1).default('dev-key-1'),
    JWT_ISSUER: z.string().min(1).default('ems.local'),
    JWT_AUDIENCE: z.string().min(1).default('ems.api'),
    JWT_ACCESS_TTL: durationString.default('10m'),
    JWT_REFRESH_TTL: durationString.default('30d'),
    JWT_STOREFRONT_TTL: durationString.default('24h'),

    // --- Crypto -----------------------------------------------------------
    ENCRYPTION_KEY_BASE64: base64Key(32, 'ENCRYPTION_KEY_BASE64'),
    // 12 is the floor: below ~10 rounds bcrypt is cheap enough to brute-force
    // offline at current GPU rates.
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(20).default(12),

    // --- Rate limiting ----------------------------------------------------
    RATE_LIMIT_ENABLED: booleanFromString.default('true'),
    RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_DEFAULT_PER_MIN: z.coerce.number().int().positive().default(120),

    // --- Mongo logging pipeline ------------------------------------------
    MONGO_LOGGING_ENABLED: booleanFromString.default('true'),
    MONGO_LOG_BUFFER_SIZE: z.coerce.number().int().positive().default(10_000),
    MONGO_LOG_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
    MONGO_LOG_FLUSH_BATCH: z.coerce.number().int().positive().default(500),
    MONGO_LOG_SAMPLE_RATE_SUCCESS_GET: z.coerce.number().min(0).max(1).default(0.1),

    // --- Object storage ---------------------------------------------------
    S3_ENDPOINT: optional(z.string().url()),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('ems-media'),
    S3_ACCESS_KEY: optional(z.string()),
    S3_SECRET_KEY: optional(z.string()),
    S3_FORCE_PATH_STYLE: booleanFromString.default('true'),

    // --- Mail -------------------------------------------------------------
    SMTP_HOST: z.string().default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_SECURE: booleanFromString.default('false'),
    SMTP_USER: optional(z.string()),
    SMTP_PASSWORD: optional(z.string()),
    MAIL_FROM: z.string().default('EMS <no-reply@ems.localhost>'),

    // --- Queues -----------------------------------------------------------
    OUTBOX_RELAY_ENABLED: booleanFromString.default('true'),
    OUTBOX_RELAY_POLL_MS: z.coerce.number().int().min(50).max(60_000).default(500),
    OUTBOX_RELAY_BATCH: z.coerce.number().int().min(1).max(1_000).default(100),

    // --- Payments ---------------------------------------------------------
    // 'stub' is an in-process gateway for dev and tests. The production refinement below
    // refuses to let it be selected in production, where it would mark invoices paid
    // without collecting money.
    PAYMENT_GATEWAY_DEFAULT: z
      .enum(['razorpay', 'stripe', 'paypal', 'cashfree', 'phonepe', 'stub'])
      .default('stub'),
    RAZORPAY_KEY_ID: optional(z.string()),
    RAZORPAY_KEY_SECRET: optional(z.string()),
    RAZORPAY_WEBHOOK_SECRET: optional(z.string()),
    STRIPE_SECRET_KEY: optional(z.string()),
    STRIPE_PUBLISHABLE_KEY: optional(z.string()),
    STRIPE_WEBHOOK_SECRET: optional(z.string()),
    PAYPAL_CLIENT_ID: optional(z.string()),
    PAYPAL_CLIENT_SECRET: optional(z.string()),
    PAYPAL_WEBHOOK_ID: optional(z.string()),
    /** 'live' or 'sandbox' — PayPal's REST API base URL differs per environment. */
    PAYPAL_ENV: z.enum(['live', 'sandbox']).default('sandbox'),
    CASHFREE_APP_ID: optional(z.string()),
    CASHFREE_SECRET_KEY: optional(z.string()),
    CASHFREE_WEBHOOK_SECRET: optional(z.string()),
    CASHFREE_ENV: z.enum(['PRODUCTION', 'SANDBOX']).default('SANDBOX'),
    PHONEPE_MERCHANT_ID: optional(z.string()),
    PHONEPE_SALT_KEY: optional(z.string()),
    PHONEPE_SALT_INDEX: optional(z.string()),
    PHONEPE_ENV: z.enum(['PRODUCTION', 'SANDBOX']).default('SANDBOX'),

    // --- Shipping -----------------------------------------------------------
    SHIPPING_CARRIER_DEFAULT: z.enum(['shiprocket', 'stub']).default('stub'),
    SHIPROCKET_EMAIL: optional(z.string()),
    SHIPROCKET_PASSWORD: optional(z.string()),
    SHIPROCKET_WEBHOOK_SECRET: optional(z.string()),

    // --- Domains, DNS & ACME (Phase 8) --------------------------------------
    /** Let's Encrypt's staging directory by default — real-looking certs, no rate limits, untrusted by browsers. */
    ACME_DIRECTORY_URL: z
      .string()
      .url()
      .default('https://acme-staging-v02.api.letsencrypt.org/directory'),
    ACME_ACCOUNT_EMAIL: optional(z.string().email()),
    DNS_PROVIDER_DEFAULT: z.enum(['cloudflare', 'stub']).default('stub'),
    CLOUDFLARE_API_TOKEN: optional(z.string()),
    /** The DNS zone the platform's own ACME challenge CNAME delegation resolves into — see `DnsProviderPort`'s doc comment. */
    ACME_CHALLENGE_DELEGATE_DOMAIN: optional(z.string()),

    // --- Observability ----------------------------------------------------
    METRICS_ENABLED: booleanFromString.default('true'),
    SWAGGER_ENABLED: booleanFromString.default('true'),
    OTEL_ENABLED: booleanFromString.default('false'),
    OTEL_EXPORTER_OTLP_ENDPOINT: optional(z.string().url()),
  })
  // Production-only tightening. These are the settings that are convenient in
  // development and dangerous in production, so the check is asserted rather
  // than left to a deployment checklist.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (env.SWAGGER_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SWAGGER_ENABLED'],
        message: 'Swagger must be disabled in production — it publishes the full API surface',
      });
    }
    if (env.MYSQL_LOGGING) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MYSQL_LOGGING'],
        message: 'MYSQL_LOGGING must be off in production — query logs leak PII at volume',
      });
    }
    if (!env.MYSQL_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MYSQL_PASSWORD'],
        message: 'A database password is required in production',
      });
    }
    if (!env.REDIS_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_PASSWORD'],
        message: 'Redis must be password-protected in production — it holds sessions and carts',
      });
    }
    if (env.JWT_KEY_ID.startsWith('dev-')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_KEY_ID'],
        message: 'JWT_KEY_ID still carries the development prefix — rotate to a real key',
      });
    }
    if (env.PAYMENT_GATEWAY_DEFAULT === 'stub') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMENT_GATEWAY_DEFAULT'],
        message:
          'The stub gateway cannot be used in production — it would settle invoices ' +
          'without taking payment',
      });
    }
    if (env.PAYMENT_GATEWAY_DEFAULT === 'razorpay' && !env.RAZORPAY_KEY_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RAZORPAY_KEY_SECRET'],
        message: 'Razorpay is the default gateway but no key secret is configured',
      });
    }
    if (env.PAYMENT_GATEWAY_DEFAULT === 'stripe' && !env.STRIPE_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_SECRET_KEY'],
        message: 'Stripe is the default gateway but no secret key is configured',
      });
    }
    if (env.PAYMENT_GATEWAY_DEFAULT === 'paypal' && !env.PAYPAL_CLIENT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYPAL_CLIENT_SECRET'],
        message: 'PayPal is the default gateway but no client secret is configured',
      });
    }
    if (env.PAYMENT_GATEWAY_DEFAULT === 'cashfree' && !env.CASHFREE_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CASHFREE_SECRET_KEY'],
        message: 'Cashfree is the default gateway but no secret key is configured',
      });
    }
    if (env.PAYMENT_GATEWAY_DEFAULT === 'phonepe' && !env.PHONEPE_SALT_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PHONEPE_SALT_KEY'],
        message: 'PhonePe is the default gateway but no salt key is configured',
      });
    }
    if (env.SHIPPING_CARRIER_DEFAULT === 'stub') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SHIPPING_CARRIER_DEFAULT'],
        message: 'The stub carrier cannot be used in production — shipments would never really dispatch',
      });
    }
    if (env.DNS_PROVIDER_DEFAULT === 'stub') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DNS_PROVIDER_DEFAULT'],
        message: 'The stub DNS provider cannot be used in production — ACME DNS-01 challenges would never really publish',
      });
    }
    if (env.ACME_DIRECTORY_URL.includes('staging')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ACME_DIRECTORY_URL'],
        message: "Production must not point at Let's Encrypt staging — issued certificates would be untrusted by browsers",
      });
    }
    if (!env.RATE_LIMIT_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RATE_LIMIT_ENABLED'],
        message: 'Rate limiting cannot be disabled in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates `process.env` and returns the typed result, or prints every problem
 * and exits.
 *
 * All errors are reported at once rather than one per restart — fixing five
 * missing variables should take one pass, not five.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    // console, not the Nest logger: the logger is not constructed yet at this point.
    console.error(
      `\n\x1b[31m✖ Invalid environment configuration\x1b[0m\n\n${issues}\n\n` +
        `Copy .env.example to .env and fill in the missing values.\n` +
        `Generate key material with: pnpm run keys:generate\n`,
    );
    process.exit(1);
  }

  return result.data;
}
