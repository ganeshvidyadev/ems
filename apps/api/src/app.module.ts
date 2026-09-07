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
import { StoreModule } from './modules/store/store.module';
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
import { InventoryModule } from './modules/inventory/inventory.module';
import { CustomerModule } from './modules/customer/customer.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { ReviewModule } from './modules/review/review.module';
import { GiftCardModule } from './modules/gift-card/gift-card.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { CartModule } from './modules/cart/cart.module';
import { OrderPaymentModule } from './modules/order-payment/order-payment.module';
import { OrderModule } from './modules/order/order.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { ThemeModule } from './modules/theme/theme.module';
import { CmsModule } from './modules/cms/cms.module';
import { BannerModule } from './modules/banner/banner.module';
import { MenuModule } from './modules/menu/menu.module';
import { SeoModule } from './modules/seo/seo.module';
import { DnsModule } from './integrations/dns/dns.module';
import { AcmeModule } from './integrations/acme/acme.module';
import { DomainModule } from './modules/domain/domain.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { ChannelIntegrationModule } from './integrations/channel/channel.module';
import { ChannelModule } from './modules/channel/channel.module';
import { ReportModule } from './modules/report/report.module';
import { SupportModule } from './modules/support/support.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PlatformOpsModule } from './modules/platform-ops/platform-ops.module';
import { TenantExportModule } from './modules/tenant-export/tenant-export.module';
import { QueueModule } from './queues/queue.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { TenantStatusGuard } from './common/guards/tenant-status.guard';
import { PlanQuotaGuard } from './common/guards/plan-quota.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { MongoLoggingInterceptor } from './common/interceptors/mongo-logging.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { HttpMetricsInterceptor } from './common/interceptors/http-metrics.interceptor';
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
    StoreModule,
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
    // Commerce (Phase 5): inventory first — customers/cart/checkout/orders below
    // all depend on it for stock reservation.
    InventoryModule,
    CustomerModule,
    CouponModule,
    ReviewModule,
    GiftCardModule,
    LoyaltyModule,
    CartModule,
    OrderPaymentModule,
    OrderModule,
    CheckoutModule,
    // Payments & shipping breadth (Phase 6): registered after checkout, which is
    // its first consumer (serviceability + rates at checkout, AWB/tracking on
    // fulfilment in OrderModule).
    ShippingModule,
    // Website builder & theming (Phase 7).
    ThemeModule,
    CmsModule,
    BannerModule,
    MenuModule,
    SeoModule,
    // Domains, hosting, SSL (Phase 8).
    DnsModule,
    AcmeModule,
    DomainModule,
    // Marketplace: sharing, commission, settlement (Phase 9). Registered after
    // CheckoutModule in this list purely for readability — as a `@Global()`
    // module its exports (`MarketplaceOrderService`, injected by
    // `CheckoutService`) are available regardless of declaration order.
    MarketplaceModule,
    // Multi-channel selling (Phase 10).
    ChannelIntegrationModule,
    ChannelModule,
    ReportModule,
    SupportModule,
    AnalyticsModule,
    PlatformOpsModule,
    TenantExportModule,
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
    // First, so it sits outermost and its timer spans every interceptor
    // below it — see the interceptor's own doc comment for why it hooks
    // `response.on('finish')` rather than relying on list position for the
    // error path too.
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MongoLoggingInterceptor },
    // Last, so it sits closest to the controller — it stores/replays the raw
    // return value, which still passes through the two interceptors above on
    // every replay (see the interceptor's own doc comment).
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
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
