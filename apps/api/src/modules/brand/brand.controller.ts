import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  brandListQuerySchema,
  buildPaginationMeta,
  createBrandRequestSchema,
  updateBrandRequestSchema,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BrandService } from './brand.service';

@ApiTags('brands')
@Controller({ path: 'console/brands', version: '1' })
export class BrandController {
  constructor(private readonly brands: BrandService) {}

  @Get()
  @Permissions('brand:read')
  @ApiOperation({ summary: 'List brands' })
  async list(
    @Query(new ZodValidationPipe(brandListQuerySchema)) query: ReturnType<typeof brandListQuerySchema.parse>,
  ) {
    const { items, total } = await this.brands.list({
      page: query.page,
      limit: query.limit,
      isActive: query.isActive,
      sort: query.sort,
    });

    return new Paginated(
      items.map((brand) => this.brands.toResponse(brand)),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get(':id')
  @Permissions('brand:read')
  @ApiOperation({ summary: 'Get a brand' })
  async get(@Param('id') id: string) {
    return this.brands.toResponse(await this.brands.getByPublicId(id));
  }

  @Post()
  @Permissions('brand:create')
  @Validate(createBrandRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a brand' })
  async create(@Body() body: ReturnType<typeof createBrandRequestSchema.parse>) {
    return this.brands.toResponse(await this.brands.create(body));
  }

  @Put(':id')
  @Permissions('brand:update')
  @ApiOperation({ summary: 'Update a brand' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBrandRequestSchema))
    body: ReturnType<typeof updateBrandRequestSchema.parse>,
  ) {
    return this.brands.toResponse(await this.brands.update(id, body));
  }

  @Delete(':id')
  @Permissions('brand:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a brand' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.brands.remove(id);
  }
}
