import { Injectable, Logger } from '@nestjs/common';
import { ValidationError } from '@ems/kernel';
import { randomBytes } from 'node:crypto';
import type { DnsProviderPort } from '../dns-provider.port';

/**
 * In-memory DNS provider for local development and tests — the DNS-side
 * twin of `StubShippingAdapter`. Records genuinely round-trip (create then
 * read gives back what was written, delete makes them disappear) so the
 * domain-verification service exercises the exact same lifecycle it will
 * run against Cloudflare, without ever touching real DNS.
 */
@Injectable()
export class StubDnsAdapter implements DnsProviderPort {
  readonly name = 'stub' as const;
  private readonly logger = new Logger(StubDnsAdapter.name);
  private readonly records = new Map<string, { subdomain: string; value: string }>();

  isConfigured(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  async createTxtRecord(subdomain: string, value: string): Promise<{ recordId: string }> {
    this.assertNotProduction();
    const recordId = `stub_dns_${randomBytes(6).toString('hex')}`;
    this.records.set(recordId, { subdomain, value });
    this.logger.debug(`TXT ${subdomain} = "${value}" (record ${recordId})`);
    return { recordId };
  }

  async deleteTxtRecord(recordId: string): Promise<void> {
    this.assertNotProduction();
    this.records.delete(recordId);
  }

  /** Dev/test only — reads back what was published, mirroring what a resolver would see. */
  lookup(recordId: string): { subdomain: string; value: string } {
    const record = this.records.get(recordId);
    if (!record) throw new ValidationError(`Unknown stub DNS record: ${recordId}`);
    return record;
  }

  private assertNotProduction(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'StubDnsAdapter was invoked in production. This would report an ACME challenge record ' +
          'as published without any resolver ever being able to see it — check DNS_PROVIDER_DEFAULT.',
      );
    }
  }
}
