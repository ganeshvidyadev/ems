import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrderPaymentWebhookController } from './order-payment-webhook.controller';
import { TaxCalculatorService } from './tax-calculator.service';

/**
 * The commerce orchestrator: cart → priced order → inventory reservation →
 * coupon/gift-card redemption → payment session → (webhook or client
 * callback) → confirmed order.
 *
 * Guest checkout only, for now. `orders.customer_id` stays NULL and identity
 * is just the email/phone captured on the order — matching docs/02 §10's
 * "NULL for pure guest checkout". Attaching a signed-in customer, and
 * therefore wiring loyalty earn/redeem into this flow, is blocked on the
 * customer-auth system (registration/OTP login, a `storefront` JWT claim)
 * that Phase 5's roadmap line item calls for but this pass does not build —
 * `CustomerService`/`LoyaltyService` are ready for it once that lands.
 */
@Module({
  controllers: [CheckoutController, OrderPaymentWebhookController],
  providers: [CheckoutService, TaxCalculatorService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
