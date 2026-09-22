import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { brandListQuerySchema, buildPaginationMeta } from '@ems/contracts';
import { Public } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BrandService } from './brand.service';

@ApiTags('storefront-brands')
@Controller({ path: 'storefront/brands', version: '1' })
export class BrandStorefrontController {
  constructor(private readonly brands: BrandService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List active brands for the storefront' })
  async list(
    @Query(new ZodValidationPipe(brandListQuerySchema)) query: ReturnType<typeof brandListQuerySchema.parse>,
  ) {
    const { items, total } = await this.brands.list({
      page: query.page,
      limit: query.limit,
      isActive: true,
      sort: query.sort,
    });

    return new Paginated(
      items.map((brand) => this.brands.toResponse(brand)),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a brand by public id' })
  async get(@Param('id') id: string) {
    return this.brands.toResponse(await this.brands.getByPublicId(id));
  }
}
