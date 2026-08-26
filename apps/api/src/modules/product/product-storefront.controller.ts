import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { buildPaginationMeta, productListQuerySchema } from '@ems/contracts';
import { NotFoundError } from '@ems/kernel';
import { Public } from '../../common/decorators';
import { CacheService } from '../../common/services/cache.service';
import { RequestContextService } from '../../common/services/request-context.service';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';
import { SEARCH_PORT, type SearchPort } from './services/search.port';

/**
 * Public, read-only. Never returns `costPriceMinor` — that field exists for merchant
 * margin reporting and must not leak to a shopper's browser.
 */
@ApiTags('storefront-products')
@Controller({ path: 'storefront/products', version: '1' })
export class ProductStorefrontController {
  constructor(
    private readonly products: ProductService,
    private readonly productRepo: ProductRepository,
    private readonly cache: CacheService,
    private readonly context: RequestContextService,
    @Inject(SEARCH_PORT) private readonly search: SearchPort,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Browse the storefront catalog' })
  async list(
    @Query(new ZodValidationPipe(productListQuerySchema))
    query: ReturnType<typeof productListQuerySchema.parse>,
  ) {
    const cacheKey = CacheService.hashQuery(query);

    const result = await this.cache.wrap(
      'products',
      `list:${cacheKey}`,
      async () => {
        if (query.q) {
          const tenantId = this.context.requireTenantId('storefront product search');
          const { ids, total } = await this.search.search({
            tenantId,
            query: query.q,
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          });
          const entities = await this.productRepo.findByIdsOrdered(ids);
          return { items: await this.products.hydrateMany(entities), total };
        }

        return this.products.list({ ...query, status: 'ACTIVE', visibility: query.visibility ?? 'VISIBLE' });
      },
      { stampedeProtection: true },
    );

    const items = await Promise.all(result.items.map((item) => this.products.toResponse(item, false)));
    return new Paginated(items, buildPaginationMeta(query.page, query.limit, result.total));
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Get a product by slug' })
  async get(@Param('slug') slug: string) {
    return this.cache.wrap(
      'products',
      `slug:${slug}`,
      async () => {
        const product = await this.productRepo.findOne({
          where: { slug, status: 'ACTIVE', visibility: 'VISIBLE' },
        });
        if (!product) throw new NotFoundError('Product', slug);
        const hydrated = await this.products.getByPublicId(product.publicId);
        return this.products.toResponse(hydrated, false);
      },
      { stampedeProtection: true },
    );
  }
}
