import { Module } from '@nestjs/common';
import { BrandController } from './brand.controller';
import { BrandStorefrontController } from './brand-storefront.controller';
import { BrandRepository } from './brand.repository';
import { BrandService } from './brand.service';

@Module({
  controllers: [BrandController, BrandStorefrontController],
  providers: [BrandRepository, BrandService],
  exports: [BrandService],
})
export class BrandModule {}
