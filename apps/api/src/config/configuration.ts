import { validateEnv, type Env } from './env.schema';

/**
 * Typed configuration tree.
 *
 * Grouped by concern so consumers inject a narrow slice (`config.get('database')`)
 * instead of reaching for individual env keys throughout the codebase. Env keys
 * appear exactly once each, here, which makes renaming one a single-file change.
 */

export interface AppConfig {
  env: Env['NODE_ENV'];
  name: string;
  url: string;
  port: number;
  prefix: string;
  logLevel: Env['LOG_LEVEL'];
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  rootDomain: string;
  consoleUrl: string;
  storefrontUrl: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  replicaHost?: string;
  poolSize: number;
  logging: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
}

/** BullMQ's own instance — `noeviction`, unlike the cache's `volatile-lru`. */
export interface RedisQueueConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface MongoConfig {
  uri: string;
  database: string;
}

export interface JwtConfig {
  privateKey: string;
  publicKey: string;
  keyId: string;
  issuer: string;
  audience: string;
  accessTtl: string;
  refreshTtl: string;
  storefrontTtl: string;
  algorithm: 'RS256';
}

export interface CryptoConfig {
  encryptionKey: Buffer;
  bcryptRounds: number;
}

export interface LoggingConfig {
  enabled: boolean;
  bufferSize: number;
  flushIntervalMs: number;
  flushBatch: number;
  successGetSampleRate: number;
}

export interface QueueConfig {
  outboxRelayEnabled: boolean;
  outboxRelayPollMs: number;
  outboxRelayBatch: number;
}

export interface PaymentConfig {
  /** Gateway used when a tenant has not configured its own. */
  defaultGateway: 'razorpay' | 'stripe' | 'paypal' | 'cashfree' | 'phonepe' | 'stub';
  razorpay: {
    keyId: string;
    keySecret: string;
    /** Separate from the API key, so a leaked key cannot forge webhook events. */
    webhookSecret: string;
  };
  stripe: {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
  };
  paypal: {
    clientId: string;
    clientSecret: string;
    webhookId: string;
    env: 'live' | 'sandbox';
  };
  cashfree: {
    appId: string;
    secretKey: string;
    webhookSecret: string;
    env: 'PRODUCTION' | 'SANDBOX';
  };
  phonepe: {
    merchantId: string;
    saltKey: string;
    saltIndex: string;
    env: 'PRODUCTION' | 'SANDBOX';
  };
}

export interface ShippingConfig {
  defaultCarrier: 'shiprocket' | 'stub';
  shiprocket: {
    email: string;
    password: string;
    webhookSecret: string;
  };
}

export interface DomainsConfig {
  acmeDirectoryUrl: string;
  acmeAccountEmail: string;
  defaultDnsProvider: 'cloudflare' | 'stub';
  cloudflare: {
    apiToken: string;
  };
  challengeDelegateDomain: string;
}

export interface Configuration {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  redisQueue: RedisQueueConfig;
  mongo: MongoConfig;
  payment: PaymentConfig;
  shipping: ShippingConfig;
  domains: DomainsConfig;
  jwt: JwtConfig;
  crypto: CryptoConfig;
  logging: LoggingConfig;
  queue: QueueConfig;
  rateLimit: { enabled: boolean; authPerMin: number; defaultPerMin: number };
  storage: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle: boolean;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  };
  observability: {
    metricsEnabled: boolean;
    swaggerEnabled: boolean;
    otelEnabled: boolean;
    otelEndpoint?: string;
  };
}

let cached: Configuration | null = null;

export function configuration(): Configuration {
  // Cached because @nestjs/config invokes the factory more than once, and
  // re-deriving Buffers and re-validating on every call is wasted work.
  if (cached) return cached;

  const env = validateEnv(process.env);

  cached = {
    app: {
      env: env.NODE_ENV,
      name: env.APP_NAME,
      url: env.APP_URL,
      port: env.API_PORT,
      prefix: env.API_PREFIX,
      logLevel: env.LOG_LEVEL,
      isProduction: env.NODE_ENV === 'production',
      isDevelopment: env.NODE_ENV === 'development',
      isTest: env.NODE_ENV === 'test',
      rootDomain: env.PLATFORM_ROOT_DOMAIN,
      consoleUrl: env.CONSOLE_URL,
      storefrontUrl: env.STOREFRONT_URL,
    },
    database: {
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT,
      database: env.MYSQL_DATABASE,
      username: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      replicaHost: env.MYSQL_REPLICA_HOST || undefined,
      poolSize: env.MYSQL_POOL_SIZE,
      logging: env.MYSQL_LOGGING,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
      keyPrefix: env.REDIS_KEY_PREFIX,
    },
    redisQueue: {
      // Falls back to the cache instance so a minimal .env still starts; the
      // dedicated instance is what removes BullMQ's eviction-policy warning.
      host: env.REDIS_QUEUE_HOST ?? env.REDIS_HOST,
      port: env.REDIS_QUEUE_PORT ?? env.REDIS_PORT,
      password: env.REDIS_QUEUE_PASSWORD || env.REDIS_PASSWORD || undefined,
      db: env.REDIS_QUEUE_DB,
    },
    mongo: {
      uri: env.MONGO_URI,
      database: env.MONGO_DATABASE,
    },
    payment: {
      defaultGateway: env.PAYMENT_GATEWAY_DEFAULT,
      razorpay: {
        keyId: env.RAZORPAY_KEY_ID ?? '',
        keySecret: env.RAZORPAY_KEY_SECRET ?? '',
        webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? '',
      },
      stripe: {
        secretKey: env.STRIPE_SECRET_KEY ?? '',
        publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? '',
        webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
      },
      paypal: {
        clientId: env.PAYPAL_CLIENT_ID ?? '',
        clientSecret: env.PAYPAL_CLIENT_SECRET ?? '',
        webhookId: env.PAYPAL_WEBHOOK_ID ?? '',
        env: env.PAYPAL_ENV,
      },
      cashfree: {
        appId: env.CASHFREE_APP_ID ?? '',
        secretKey: env.CASHFREE_SECRET_KEY ?? '',
        webhookSecret: env.CASHFREE_WEBHOOK_SECRET ?? '',
        env: env.CASHFREE_ENV,
      },
      phonepe: {
        merchantId: env.PHONEPE_MERCHANT_ID ?? '',
        saltKey: env.PHONEPE_SALT_KEY ?? '',
        saltIndex: env.PHONEPE_SALT_INDEX ?? '1',
        env: env.PHONEPE_ENV,
      },
    },
    shipping: {
      defaultCarrier: env.SHIPPING_CARRIER_DEFAULT,
      shiprocket: {
        email: env.SHIPROCKET_EMAIL ?? '',
        password: env.SHIPROCKET_PASSWORD ?? '',
        webhookSecret: env.SHIPROCKET_WEBHOOK_SECRET ?? '',
      },
    },
    domains: {
      acmeDirectoryUrl: env.ACME_DIRECTORY_URL,
      acmeAccountEmail: env.ACME_ACCOUNT_EMAIL ?? '',
      defaultDnsProvider: env.DNS_PROVIDER_DEFAULT,
      cloudflare: {
        apiToken: env.CLOUDFLARE_API_TOKEN ?? '',
      },
      challengeDelegateDomain: env.ACME_CHALLENGE_DELEGATE_DOMAIN ?? '',
    },
    jwt: {
      // Decoded here so no consumer has to remember the encoding.
      privateKey: Buffer.from(env.JWT_PRIVATE_KEY_BASE64, 'base64').toString('utf8'),
      publicKey: Buffer.from(env.JWT_PUBLIC_KEY_BASE64, 'base64').toString('utf8'),
      keyId: env.JWT_KEY_ID,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
      storefrontTtl: env.JWT_STOREFRONT_TTL,
      algorithm: 'RS256',
    },
    crypto: {
      encryptionKey: Buffer.from(env.ENCRYPTION_KEY_BASE64, 'base64').subarray(0, 32),
      bcryptRounds: env.BCRYPT_ROUNDS,
    },
    logging: {
      enabled: env.MONGO_LOGGING_ENABLED,
      bufferSize: env.MONGO_LOG_BUFFER_SIZE,
      flushIntervalMs: env.MONGO_LOG_FLUSH_INTERVAL_MS,
      flushBatch: env.MONGO_LOG_FLUSH_BATCH,
      successGetSampleRate: env.MONGO_LOG_SAMPLE_RATE_SUCCESS_GET,
    },
    queue: {
      outboxRelayEnabled: env.OUTBOX_RELAY_ENABLED,
      outboxRelayPollMs: env.OUTBOX_RELAY_POLL_MS,
      outboxRelayBatch: env.OUTBOX_RELAY_BATCH,
    },
    rateLimit: {
      enabled: env.RATE_LIMIT_ENABLED,
      authPerMin: env.RATE_LIMIT_AUTH_PER_MIN,
      defaultPerMin: env.RATE_LIMIT_DEFAULT_PER_MIN,
    },
    storage: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    },
    mail: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.MAIL_FROM,
    },
    observability: {
      metricsEnabled: env.METRICS_ENABLED,
      swaggerEnabled: env.SWAGGER_ENABLED,
      otelEnabled: env.OTEL_ENABLED,
      otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
  };

  return cached;
}

/** Test-only: clears the memoized config so a suite can re-validate a mutated env. */
export function resetConfigurationCache(): void {
  cached = null;
}
