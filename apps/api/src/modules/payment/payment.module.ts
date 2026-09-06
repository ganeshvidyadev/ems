import { Global, Module } from '@nestjs/common';
import { PaymentGatewayFactory } from '../../integrations/payment/payment-gateway.factory';
import { RazorpayAdapter } from '../../integrations/payment/razorpay/razorpay.adapter';
import { StripeAdapter } from '../../integrations/payment/stripe/stripe.adapter';
import { PayPalAdapter } from '../../integrations/payment/paypal/paypal.adapter';
import { CashfreeAdapter } from '../../integrations/payment/cashfree/cashfree.adapter';
import { PhonePeAdapter } from '../../integrations/payment/phonepe/phonepe.adapter';
import { StubPaymentAdapter } from '../../integrations/payment/stub/stub.adapter';
import { BillingController, DevPaymentController } from './payment.controller';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentService } from './payment.service';

/**
 * Payment collection for subscriptions.
 *
 * Adapters are registered as providers so they can inject `ConfigService`; the factory then
 * resolves between them by name. Nothing outside this module imports an adapter directly —
 * that is what keeps adding Stripe a matter of writing one class.
 */
@Global()
@Module({
  controllers: [BillingController, PaymentWebhookController, DevPaymentController],
  providers: [
    RazorpayAdapter,
    StripeAdapter,
    PayPalAdapter,
    CashfreeAdapter,
    PhonePeAdapter,
    StubPaymentAdapter,
    PaymentGatewayFactory,
    PaymentService,
  ],
  exports: [PaymentService, PaymentGatewayFactory],
})
export class PaymentModule {}
