import { Global, Module } from '@nestjs/common';
import { ShippingCarrierFactory } from '../../integrations/shipping/shipping-carrier.factory';
import { ShiprocketAdapter } from '../../integrations/shipping/shiprocket/shiprocket.adapter';
import { StubShippingAdapter } from '../../integrations/shipping/stub/stub.adapter';

/**
 * Exposes `ShippingCarrierFactory` platform-wide, the same way `PaymentModule`
 * exposes `PaymentGatewayFactory` — checkout (serviceability + rates) and the
 * order module (AWB assignment, pickup, tracking) both depend on it without a
 * module import edge.
 */
@Global()
@Module({
  providers: [ShiprocketAdapter, StubShippingAdapter, ShippingCarrierFactory],
  exports: [ShippingCarrierFactory],
})
export class ShippingModule {}
