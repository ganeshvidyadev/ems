import { Global, Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartProductLookupRepository } from './cart-product-lookup.repository';
import { CartService } from './cart.service';

/** `@Global()`: checkout reads and clears the cart from outside this module's own request graph. */
@Global()
@Module({
  controllers: [CartController],
  providers: [CartProductLookupRepository, CartService],
  exports: [CartService, CartProductLookupRepository],
})
export class CartModule {}
