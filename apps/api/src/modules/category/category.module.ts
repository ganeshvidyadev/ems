import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryStorefrontController } from './category-storefront.controller';
import { CategoryRepository } from './category.repository';
import { CategoryService } from './category.service';

@Module({
  controllers: [CategoryController, CategoryStorefrontController],
  providers: [CategoryRepository, CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
