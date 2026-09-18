import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { buildPaginationMeta, categoryListQuerySchema } from '@ems/contracts';
import { Public } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CategoryService } from './category.service';

@ApiTags('storefront-categories')
@Controller({ path: 'storefront/categories', version: '1' })
export class CategoryStorefrontController {
  constructor(private readonly categories: CategoryService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List active categories for the storefront' })
  async list(
    @Query(new ZodValidationPipe(categoryListQuerySchema))
    query: ReturnType<typeof categoryListQuerySchema.parse>,
  ) {
    const { items, total } = await this.categories.list({
      page: query.page,
      limit: query.limit,
      parentPublicId: query.parentId,
      isActive: true,
      sort: query.sort,
    });

    return new Paginated(
      await this.categories.toResponseList(items),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get('tree')
  @Public()
  @ApiOperation({ summary: 'The full active category tree for the storefront' })
  async tree(@Query('storeId') storeId?: string) {
    return this.categories.tree(storeId);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a category by public id' })
  async get(@Param('id') id: string) {
    const category = await this.categories.getByPublicId(id);
    return this.categories.toResponse(category, await this.categories.resolveParentPublicId(category));
  }
}
