import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { resolve } from 'node:path';
import { configuration, type AppConfig } from './config/configuration';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/typeorm.module';
import { LoggingModule } from './modules/logging/logging.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { ProvisioningModule } from './modules/provisioning/provisioning.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NotificationModule } from './modules/notification/notification.module';
import { StorageModule } from './integrations/storage/storage.module';
import { BrandModule } from './modules/brand/brand.module';
import { CategoryModule } from './modules/category/category.module';
import { TaxModule } from './modules/tax/tax.module';
import { MediaModule } from './modules/media/media.module';
import { JobModule } from './modules/job/job.module';
import { ProductModule } from './modules/product/product.module';
import { QueueModule } from './queues/queue.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { TenantStatusGuard } from './common/guards/tenant-status.guard';
import { PlanQuotaGuard } from './common/guards/plan-quota.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { MongoLoggingInterceptor } from './common/interceptors/mongo-logging.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { TenantResolverMiddleware } from './common/middleware/tenant-resolver.middleware';
import { RequestContextService } from './common/services/request-context.service';

/**
 * Root module.
 *
 * Interceptor order is significant. Nest runs global interceptors in registration
 * order on the way in and **reverse** order on the way out, so the envelope
 * interceptor is registered before the logging interceptor. That way the logger
 * observes the final, enveloped response body rather than the controller's raw
 * return value — which is what a support engineer reading `api_logs` needs to see.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // One .env at the repo root, shared with docker-compose so the two cannot
      // disagree about ports and credentials.
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
      cache: true,
      // Validation lives in configuration()/env.schema.ts, which reports every
      // problem at once and exits.
      validate: undefined,
    }),

    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      // In-process only, for loss-tolerant concerns (cache-warming hints).
      // Anything that must not be lost goes through the transactional outbox.
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    CommonModule,
    DatabaseModule,
    LoggingModule,
    StorageModule,
    QueueModule,
    NotificationModule,
    AuthModule,
    UserModule,
    SubscriptionModule,
    ProvisioningModule,
    PaymentModule,
    // Catalog (Phase 4): brand/category/tax are simple Tier C-ish modules; JobModule backs
    // bulk import/export status; ProductModule is the aggregate root and is `@Global()`
    // itself (see its own file) so the queue-side import processor can reach it.
    BrandModule,
    CategoryModule,
    TaxModule,
    MediaModule,
    JobModule,
    ProductModule,
    HealthModule,
  ],
  providers: [
    // Guard order is the registration order, and it matters:
    //   1. JwtAuthGuard      — authenticate, and set tenant context from the verified
    //                          `tid` claim. Everything below depends on that context.
    //   2. TenantStatusGuard — is this tenant allowed to act at all? Checked before
    //                          permissions so a suspended tenant gets 403 SUSPENDED
    //                          rather than a misleading "missing permission".
    //   3. PermissionsGuard  — does this user hold the required permission?
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    //   4. PlanQuotaGuard — last, because it is the most expensive check (it counts rows).
    //      No point counting products for a caller who is about to be rejected as
    //      unauthenticated, suspended, or unauthorised.
    { provide: APP_GUARD, useClass: PlanQuotaGuard },
    {
      provide: APP_FILTER,
      inject: [RequestContextService, ConfigService],
      useFactory: (context: RequestContextService, configService: ConfigService) =>
        new GlobalExceptionFilter(
          context,
          configService.getOrThrow<AppConfig>('app').isProduction,
        ),
    },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MongoLoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // RequestContextMiddleware MUST be first: it opens the AsyncLocalStorage store
    // that everything downstream — including the exception filter — reads from.
    //
    // '{*path}' rather than '*': Express 5 / path-to-regexp v8 dropped bare
    // wildcards and requires a named parameter. Nest auto-converts '*' with a
    // deprecation warning, but relying on that would break on the next major.
    consumer
      .apply(RequestContextMiddleware, TenantResolverMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
