import 'reflect-metadata';
import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  // Typed as the Express adapter so `app.set('trust proxy', …)` is available.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Buffered so config-validation failures print cleanly instead of interleaving
    // with Nest's own startup output.
    bufferLogs: true,
    // Raw body preserved for webhook HMAC verification: signatures are computed
    // over the exact bytes, and a parse/re-serialise round-trip changes them.
    rawBody: true,
  });

  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);
  const config = configService.getOrThrow<AppConfig>('app');

  // -------------------------------------------------------------------------
  // Security
  // -------------------------------------------------------------------------
  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
      hsts: config.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  app.use(compression());
  app.use(cookieParser());

  /**
   * Dynamic CORS against a domain allowlist — never `origin: true`.
   *
   * Reflecting the request's Origin would let any site issue credentialed requests
   * against the API on a logged-in merchant's behalf. Tenant custom domains are
   * resolved from `tenant_domains` at request time (Phase 8); for now the two
   * first-party apps plus configured localhost origins are permitted.
   */
  const staticOrigins = new Set([config.consoleUrl, config.storefrontUrl, config.url]);
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Same-origin/server-to-server requests send no Origin header.
      if (!origin) return callback(null, true);
      if (staticOrigins.has(origin)) return callback(null, true);
      if (!config.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Correlation-Id',
      'Idempotency-Key',
      'X-Tenant-Slug',
    ],
    exposedHeaders: ['X-Correlation-Id', 'Retry-After', 'X-RateLimit-Remaining'],
    maxAge: 86_400,
  });

  /**
   * Trust exactly one proxy hop (the ALB/Nginx in front of us).
   *
   * `trust proxy: true` would trust the entire `X-Forwarded-For` chain, letting a
   * client prepend a forged address and defeat per-IP rate limiting on the auth
   * endpoints. A fixed hop count only trusts what our own proxy appended.
   */
  app.set('trust proxy', 1);

  // -------------------------------------------------------------------------
  // Routing
  // -------------------------------------------------------------------------
  app.setGlobalPrefix(config.prefix, {
    // Probes and metrics live outside /api/v1: they are infrastructure contracts
    // consumed by Kubernetes and Prometheus, not versioned product API.
    //
    // JWKS is excluded for a different reason — RFC 8414 places discovery documents
    // under `/.well-known/` at the host root, and off-the-shelf JWT verifiers look
    // there. Serving it at `/api/.well-known/` would work only for clients we
    // hand-configure.
    exclude: [
      'health/live',
      'health/ready',
      'health/startup',
      'metrics',
      '.well-known/jwks.json',
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // No global ValidationPipe. Nest's pipe validates `class-validator` decorators
  // on class DTOs; every DTO here is a Zod schema from @ems/contracts, validated
  // by ZodValidationPipe at the parameter. Registering it globally would pull in
  // class-validator/class-transformer to do precisely nothing, and would leave two
  // competing validation stories in the codebase.
  app.enableShutdownHooks();

  // -------------------------------------------------------------------------
  // Swagger
  // -------------------------------------------------------------------------
  if (config.isProduction) {
    logger.log('Swagger disabled (production)');
  } else {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('EMS — Multi-Tenant E-Commerce SaaS API')
        .setDescription(
          'Three route trees with different auth models:\n\n' +
            '- `/api/v1/console/*` — merchant dashboard (tenant JWT + RBAC)\n' +
            '- `/api/v1/storefront/*` — public storefront (tenant resolved from Host)\n' +
            '- `/api/v1/platform/*` — super admin (cross-tenant by design)\n\n' +
            'Every response uses the envelope described in docs/04-api-conventions.md §2.',
        )
        .setVersion('1.0')
        .addBearerAuth(
          { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          'access-token',
        )
        .addServer(`${config.url.replace(/\/$/, '')}`)
        .build(),
      { operationIdFactory: (_controller, method) => method },
    );

    SwaggerModule.setup(`${config.prefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', docExpansion: 'none' },
    });
  }

  await app.listen(config.port, '0.0.0.0');

  logger.log(`API listening on http://localhost:${config.port}/${config.prefix}/v1`);
  logger.log(`Health   http://localhost:${config.port}/health/ready`);
  logger.log(`Metrics  http://localhost:${config.port}/metrics`);
  if (!config.isProduction) {
    logger.log(`Swagger  http://localhost:${config.port}/${config.prefix}/docs`);
  }
}

void bootstrap().catch((error: unknown) => {
  // Nest's logger may not exist yet if the failure was during module construction.
  console.error('Failed to start API:', error);
  process.exit(1);
});
