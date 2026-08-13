import { Global, Module } from '@nestjs/common';
import { InvoiceService } from './services/invoice.service';
import { PlanQuotaService } from './services/plan-quota.service';
import { SubscriptionService } from './services/subscription.service';
import { PlanController, SubscriptionController } from './subscription.controller';

/**
 * Plans, subscriptions, invoicing and quota enforcement.
 *
 * `@Global()` because `PlanQuotaGuard` is registered app-wide via `APP_GUARD` and resolves
 * from the root injector — `PlanQuotaService` has to be reachable there.
 */
@Global()
@Module({
  controllers: [PlanController, SubscriptionController],
  providers: [PlanQuotaService, InvoiceService, SubscriptionService],
  exports: [PlanQuotaService, InvoiceService, SubscriptionService],
})
export class SubscriptionModule {}
