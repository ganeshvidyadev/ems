import { Global, Module } from '@nestjs/common';
import { JobModule } from '../job/job.module';
import { ProductController } from './product.controller';
import { ProductStorefrontController } from './product-storefront.controller';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';
import { VariantRepository } from './variant.repository';
import { VariantService } from './services/variant.service';
import { AttributeRepository, AttributeValueRepository } from './attribute.repository';
import { AttributeService } from './services/attribute.service';
import { MysqlFulltextAdapter } from './services/mysql-fulltext.adapter';
import { SEARCH_PORT } from './services/search.port';
import { ProductImportService } from './services/product-import.service';
import { ProductExportService } from './services/product-export.service';

/**
 * `@Global()` for the same reason `ProvisioningModule` is: `ProductImportProcessor` in
 * `queues/` resolves `ProductRepository` from the root injector, with no HTTP request
 * (and therefore no module import edge) involved.
 */
@Global()
@Module({
  imports: [JobModule],
  controllers: [ProductController, ProductStorefrontController],
  providers: [
    ProductRepository,
    ProductService,
    VariantRepository,
    VariantService,
    AttributeRepository,
    AttributeValueRepository,
    AttributeService,
    { provide: SEARCH_PORT, useClass: MysqlFulltextAdapter },
    ProductImportService,
    ProductExportService,
  ],
  // `ProductRepository` is exported so `QueueModule`'s `ProductImportProcessor` can use
  // it without duplicating its query/event-emission logic.
  exports: [ProductRepository, ProductService],
})
export class ProductModule {}
