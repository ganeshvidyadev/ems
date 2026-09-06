import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
import type { PaymentConfig } from '../../config/configuration';
import type { GatewayName, PaymentGatewayPort } from './payment-gateway.port';
import { RazorpayAdapter } from './razorpay/razorpay.adapter';
import { StripeAdapter } from './stripe/stripe.adapter';
import { PayPalAdapter } from './paypal/paypal.adapter';
import { CashfreeAdapter } from './cashfree/cashfree.adapter';
import { PhonePeAdapter } from './phonepe/phonepe.adapter';
import { StubPaymentAdapter } from './stub/stub.adapter';

/**
 * Resolves a gateway by name.
 *
 * Callers ask for the gateway a tenant has configured (or the platform default) and get a
 * `PaymentGatewayPort` back. Nothing above this line knows Razorpay exists, which is what
 * makes adding Stripe or Cashfree a new adapter rather than a change to the billing code.
 *
 * A gateway that is registered but **not configured** is refused rather than returned. A
 * half-configured gateway fails at the worst moment — mid-checkout, with the customer
 * watching — so it is caught at resolution time instead.
 */
@Injectable()
export class PaymentGatewayFactory {
  private readonly logger = new Logger(PaymentGatewayFactory.name);
  private readonly config: PaymentConfig;
  private readonly adapters = new Map<GatewayName, PaymentGatewayPort>();

  constructor(
    configService: ConfigService,
    razorpay: RazorpayAdapter,
    stripe: StripeAdapter,
    paypal: PayPalAdapter,
    cashfree: CashfreeAdapter,
    phonepe: PhonePeAdapter,
    stub: StubPaymentAdapter,
  ) {
    this.config = configService.getOrThrow<PaymentConfig>('payment');

    this.adapters.set('razorpay', razorpay);
    this.adapters.set('stripe', stripe);
    this.adapters.set('paypal', paypal);
    this.adapters.set('cashfree', cashfree);
    this.adapters.set('phonepe', phonepe);
    this.adapters.set('stub', stub);

    const available = [...this.adapters.entries()]
      .filter(([, adapter]) => adapter.isConfigured())
      .map(([name]) => name);

    this.logger.log(
      `Payment gateways available: ${available.join(', ') || 'none'} ` +
        `(default: ${this.config.defaultGateway})`,
    );
  }

  /** The gateway to use when a tenant has not chosen one. */
  get defaultGateway(): GatewayName {
    return this.config.defaultGateway;
  }

  resolve(name?: GatewayName): PaymentGatewayPort {
    const target = name ?? this.config.defaultGateway;
    const adapter = this.adapters.get(target);

    if (!adapter) {
      // Named in config but no implementation registered — a deployment error, not a
      // runtime condition, so it is worth being explicit about.
      throw new ExternalServiceError(target, `No adapter is registered for gateway '${target}'`);
    }

    if (!adapter.isConfigured()) {
      throw new ExternalServiceError(
        target,
        `Gateway '${target}' is selected but its credentials are not configured`,
      );
    }

    return adapter;
  }

  /** Gateways a merchant can actually be offered. */
  configuredGateways(): GatewayName[] {
    return [...this.adapters.entries()]
      .filter(([, adapter]) => adapter.isConfigured())
      .map(([name]) => name);
  }

  /**
   * Every registered adapter, configured or not.
   *
   * Used by the webhook route, which must try each one's signature scheme: an inbound
   * webhook does not say which gateway it came from in a trustworthy way, so identification
   * *is* verification.
   */
  allAdapters(): PaymentGatewayPort[] {
    return [...this.adapters.values()];
  }
}
