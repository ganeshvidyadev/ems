import { Module } from '@nestjs/common';
import { StoreController } from './store.controller';
import { StoreRepository } from './store.repository';

@Module({
  controllers: [StoreController],
  providers: [StoreRepository],
  exports: [StoreRepository],
})
export class StoreModule {}
