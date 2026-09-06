import { Global, Module } from '@nestjs/common';
import { ChannelAdapterFactory } from './channel-adapter.factory';
import { EbayChannelAdapter } from './ebay/ebay-channel.adapter';
import { StubChannelAdapter } from './stub/stub-channel.adapter';

/** Exposes `ChannelAdapterFactory` platform-wide, the same way `ShippingModule` exposes its factory. */
@Global()
@Module({
  providers: [EbayChannelAdapter, StubChannelAdapter, ChannelAdapterFactory],
  exports: [ChannelAdapterFactory],
})
export class ChannelIntegrationModule {}
