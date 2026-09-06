import { Injectable, Logger } from '@nestjs/common';
import { ExternalServiceError } from '@ems/kernel';
import type { ChannelType } from '../../database/entities';
import type { ChannelAdapterPort } from './channel-adapter.port';
import { EbayChannelAdapter } from './ebay/ebay-channel.adapter';
import { StubChannelAdapter } from './stub/stub-channel.adapter';

/** Channel types with no adapter registered yet — see docs/05 Phase 10's own "Honest constraint". */
const PENDING_EXTERNAL_APPROVAL: ReadonlySet<ChannelType> = new Set([
  'AMAZON',
  'FLIPKART',
  'FACEBOOK',
  'INSTAGRAM',
  'WHATSAPP',
  'GOOGLE',
]);

/**
 * Resolves a channel adapter by type — the channel-side twin of
 * `ShippingCarrierFactory`/`DnsProviderFactory`, except there is no single
 * "default" here: each connected `channels` row names its own `type`, and
 * every tenant can connect several different channels at once.
 */
@Injectable()
export class ChannelAdapterFactory {
  private readonly logger = new Logger(ChannelAdapterFactory.name);
  private readonly adapters = new Map<ChannelType, ChannelAdapterPort>();

  constructor(ebay: EbayChannelAdapter, stub: StubChannelAdapter) {
    this.adapters.set('EBAY', ebay);
    this.adapters.set('STUB', stub);

    const available = [...this.adapters.entries()]
      .filter(([, adapter]) => adapter.isConfigured())
      .map(([type]) => type);
    this.logger.log(`Channel adapters available: ${available.join(', ') || 'none'}`);
  }

  resolve(type: ChannelType): ChannelAdapterPort {
    if (PENDING_EXTERNAL_APPROVAL.has(type)) {
      throw new ExternalServiceError(
        type,
        `${type} needs a registered, approved developer app before it can connect — see docs/05 Phase 10's ` +
          `own note on external review timelines. Not yet implemented in this build.`,
      );
    }

    const adapter = this.adapters.get(type);
    if (!adapter) throw new ExternalServiceError(type, `No adapter is registered for channel type '${type}'`);
    if (!adapter.isConfigured()) {
      throw new ExternalServiceError(type, `Channel '${type}' is selected but its credentials are not configured`);
    }
    return adapter;
  }

  isSupported(type: ChannelType): boolean {
    return this.adapters.has(type) && !PENDING_EXTERNAL_APPROVAL.has(type);
  }
}
