import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
import type { DomainsConfig } from '../../config/configuration';
import type { DnsProviderPort } from './dns-provider.port';
import { CloudflareDnsAdapter } from './cloudflare/cloudflare-dns.adapter';
import { StubDnsAdapter } from './stub/stub-dns.adapter';

/** Resolves a DNS provider by name — the DNS-side twin of `ShippingCarrierFactory`. */
@Injectable()
export class DnsProviderFactory {
  private readonly logger = new Logger(DnsProviderFactory.name);
  private readonly config: DomainsConfig;
  private readonly adapters = new Map<'cloudflare' | 'stub', DnsProviderPort>();

  constructor(configService: ConfigService, cloudflare: CloudflareDnsAdapter, stub: StubDnsAdapter) {
    this.config = configService.getOrThrow<DomainsConfig>('domains');

    this.adapters.set('cloudflare', cloudflare);
    this.adapters.set('stub', stub);

    const available = [...this.adapters.entries()]
      .filter(([, adapter]) => adapter.isConfigured())
      .map(([name]) => name);

    this.logger.log(
      `DNS providers available: ${available.join(', ') || 'none'} (default: ${this.config.defaultDnsProvider})`,
    );
  }

  resolve(): DnsProviderPort {
    const target = this.config.defaultDnsProvider;
    const adapter = this.adapters.get(target);

    if (!adapter) {
      throw new ExternalServiceError(target, `No adapter is registered for DNS provider '${target}'`);
    }
    if (!adapter.isConfigured()) {
      throw new ExternalServiceError(target, `DNS provider '${target}' is selected but its credentials are not configured`);
    }
    return adapter;
  }
}
