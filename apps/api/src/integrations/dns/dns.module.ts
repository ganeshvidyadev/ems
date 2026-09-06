import { Global, Module } from '@nestjs/common';
import { CloudflareDnsAdapter } from './cloudflare/cloudflare-dns.adapter';
import { DnsProviderFactory } from './dns-provider.factory';
import { StubDnsAdapter } from './stub/stub-dns.adapter';

/** Exposes `DnsProviderFactory` platform-wide, the same way `ShippingModule` exposes its factory. */
@Global()
@Module({
  providers: [CloudflareDnsAdapter, StubDnsAdapter, DnsProviderFactory],
  exports: [DnsProviderFactory],
})
export class DnsModule {}
