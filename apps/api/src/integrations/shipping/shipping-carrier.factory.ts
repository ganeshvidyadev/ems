import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
import type { ShippingConfig } from '../../config/configuration';
import type { CarrierName, ShippingCarrierPort } from './shipping-carrier.port';
import { ShiprocketAdapter } from './shiprocket/shiprocket.adapter';
import { StubShippingAdapter } from './stub/stub.adapter';

/**
 * Resolves a carrier by name — the shipping-side twin of `PaymentGatewayFactory`,
 * down to refusing an adapter that is registered but not configured, which fails at
 * resolution time rather than mid-fulfilment with a merchant waiting on a label.
 */
@Injectable()
export class ShippingCarrierFactory {
  private readonly logger = new Logger(ShippingCarrierFactory.name);
  private readonly config: ShippingConfig;
  private readonly adapters = new Map<CarrierName, ShippingCarrierPort>();

  constructor(
    configService: ConfigService,
    shiprocket: ShiprocketAdapter,
    stub: StubShippingAdapter,
  ) {
    this.config = configService.getOrThrow<ShippingConfig>('shipping');

    this.adapters.set('shiprocket', shiprocket);
    this.adapters.set('stub', stub);

    const available = [...this.adapters.entries()]
      .filter(([, adapter]) => adapter.isConfigured())
      .map(([name]) => name);

    this.logger.log(
      `Shipping carriers available: ${available.join(', ') || 'none'} (default: ${this.config.defaultCarrier})`,
    );
  }

  get defaultCarrier(): CarrierName {
    return this.config.defaultCarrier;
  }

  resolve(name?: CarrierName): ShippingCarrierPort {
    const target = name ?? this.config.defaultCarrier;
    const adapter = this.adapters.get(target);

    if (!adapter) {
      throw new ExternalServiceError(target, `No adapter is registered for carrier '${target}'`);
    }
    if (!adapter.isConfigured()) {
      throw new ExternalServiceError(target, `Carrier '${target}' is selected but its credentials are not configured`);
    }
    return adapter;
  }

  configuredCarriers(): CarrierName[] {
    return [...this.adapters.entries()].filter(([, adapter]) => adapter.isConfigured()).map(([name]) => name);
  }

  allAdapters(): ShippingCarrierPort[] {
    return [...this.adapters.values()];
  }
}
