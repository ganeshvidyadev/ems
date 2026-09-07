import { Module } from '@nestjs/common';
import { StoreController } from './store.controller';
import { StoreStorefrontController } from './store-storefront.controller';
import { StoreRepository } from './store.repository';

@Module({
  controllers: [StoreController, StoreStorefrontController],
  providers: [StoreRepository],
  exports: [StoreRepository],
})
export class StoreModule {}
