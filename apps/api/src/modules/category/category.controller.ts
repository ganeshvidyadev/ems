import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  buildPaginationMeta,
  categoryListQuerySchema,
  createCategoryRequestSchema,
  moveCategoryRequestSchema,
  reorderCategoriesRequestSchema,
  updateCategoryRequestSchema,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CategoryService } from './category.service';

@ApiTags('categories')
@Controller({ path: 'console/categories', version: '1' })
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  @Get()
  @Permissions('category:read')
  @ApiOperation({ summary: 'List categories' })
  async list(
    @Query(new ZodValidationPipe(categoryListQuerySchema))
    query: ReturnType<typeof categoryListQuerySchema.parse>,
  ) {
    const { items, total } = await this.categories.list({
      page: query.page,
      limit: query.limit,
      parentPublicId: query.parentId,
      isActive: query.isActive,
      sort: query.sort,
    });

    return new Paginated(
      await this.categories.toResponseList(items),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get('tree')
  @Permissions('category:read')
  @ApiOperation({ summary: 'The full category tree' })
  async tree(@Query('storeId') storeId?: string) {
    return this.categories.tree(storeId);
  }

  @Get(':id')
  @Permissions('category:read')
  @ApiOperation({ summary: 'Get a category' })
  async get(@Param('id') id: string) {
    const category = await this.categories.getByPublicId(id);
    return this.categories.toResponse(category, await this.categories.resolveParentPublicId(category));
  }

  @Post()
  @Permissions('category:create')
  @Validate(createCategoryRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a category' })
  async create(@Body() body: ReturnType<typeof createCategoryRequestSchema.parse>) {
    const category = await this.categories.create(body);
    return this.categories.toResponse(category, await this.categories.resolveParentPublicId(category));
  }

  @Put(':id')
  @Permissions('category:update')
  @ApiOperation({ summary: 'Update a category' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategoryRequestSchema))
    body: ReturnType<typeof updateCategoryRequestSchema.parse>,
  ) {
    const category = await this.categories.update(id, body);
    return this.categories.toResponse(category, await this.categories.resolveParentPublicId(category));
  }

  @Post(':id/move')
  @Permissions('category:update')
  @ApiOperation({ summary: 'Move a category to a new parent' })
  async move(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveCategoryRequestSchema))
    body: ReturnType<typeof moveCategoryRequestSchema.parse>,
  ) {
    const category = await this.categories.move(id, body.parentId);
    return this.categories.toResponse(category, await this.categories.resolveParentPublicId(category));
  }

  @Post('reorder')
  @Permissions('category:reorder')
  @Validate(reorderCategoriesRequestSchema)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder siblings under one parent' })
  async reorder(@Body() body: ReturnType<typeof reorderCategoriesRequestSchema.parse>) {
    await this.categories.reorder(body.parentId, body.orderedIds);
    return { message: 'Reordered.' };
  }

  @Delete(':id')
  @Permissions('category:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category (must have no children)' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.categories.remove(id);
  }
}
