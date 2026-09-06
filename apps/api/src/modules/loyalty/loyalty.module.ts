import { Global, Module } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyTransactionRepository } from './loyalty.repository';
import { LoyaltyService } from './loyalty.service';

/** `@Global()`: checkout awards/redeems points from outside this module's own request graph. */
@Global()
@Module({
  controllers: [LoyaltyController],
  providers: [LoyaltyTransactionRepository, LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
