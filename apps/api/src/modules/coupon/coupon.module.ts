import { Global, Module } from '@nestjs/common';
import { CouponController } from './coupon.controller';
import { CouponRedemptionRepository, CouponRepository } from './coupon.repository';
import { CouponService } from './coupon.service';

/** `@Global()`: checkout validates and redeems coupons from outside this module's own request graph. */
@Global()
@Module({
  controllers: [CouponController],
  providers: [CouponRepository, CouponRedemptionRepository, CouponService],
  exports: [CouponService],
})
export class CouponModule {}
