import { Global, Module } from '@nestjs/common';
import { GiftCardController } from './gift-card.controller';
import { GiftCardRepository } from './gift-card.repository';
import { GiftCardService } from './gift-card.service';

/** `@Global()`: checkout redeems gift cards from outside this module's own request graph. */
@Global()
@Module({
  controllers: [GiftCardController],
  providers: [GiftCardRepository, GiftCardService],
  exports: [GiftCardService],
})
export class GiftCardModule {}
