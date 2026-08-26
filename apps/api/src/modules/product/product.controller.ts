import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  buildPaginationMeta,
  createProductAttributeRequestSchema,
  createProductRequestSchema,
  productExportRequestSchema,
  productImportRequestSchema,
  productListQuerySchema,
  updateProductRequestSchema,
} from '@ems/contracts';
import { PlanQuota, Permissions, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JobService } from '../job/job.service';
import { AttributeService } from './services/attribute.service';
import { ProductExportService } from './services/product-export.service';
import { ProductImportService } from './services/product-import.service';
import { ProductService } from './product.service';

@ApiTags('products')
@Controller({ path: 'console/products', version: '1' })
export class ProductController {
  constructor(
    private readonly products: ProductService,
    private readonly attributes: AttributeService,
    private readonly imports: ProductImportService,
    private readonly exports: ProductExportService,
    private readonly jobs: JobService,
  ) {}

  @Get()
  @Permissions('product:read')
  @ApiOperation({ summary: 'List products' })
  async list(
    @Query(new ZodValidationPipe(productListQuerySchema))
    query: ReturnType<typeof productListQuerySchema.parse>,
  ) {
    const { items, total } = await this.products.list(query);

    return new Paginated(
      await Promise.all(items.map((item) => this.products.toResponse(item, true))),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get('attributes')
  @Permissions('product:read')
  @ApiOperation({ summary: 'List the attribute registry' })
  async listAttributes() {
    const rows = await this.attributes.list();
    return rows.map((a) => this.attributes.toResponse(a));
  }

  @Post('attributes')
  @Permissions('product:update')
  @Validate(createProductAttributeRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new product attribute' })
  async createAttribute(@Body() body: ReturnType<typeof createProductAttributeRequestSchema.parse>) {
    return this.attributes.toResponse(await this.attributes.create(body));
  }

  @Post('import')
  @Permissions('product:import')
  @Validate(productImportRequestSchema)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start a bulk CSV/XLSX import (file must already be uploaded via a presigned URL)' })
  async import(@Body() body: ReturnType<typeof productImportRequestSchema.parse>) {
    const job = await this.imports.start(body);
    return this.jobs.toResponse(job);
  }

  @Post('export')
  @Permissions('product:export')
  @Validate(productExportRequestSchema)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export products to CSV/XLSX, returning a signed download URL' })
  async export(@Body() body: ReturnType<typeof productExportRequestSchema.parse>) {
    return this.exports.export(body);
  }

  @Get(':id')
  @Permissions('product:read')
  @ApiOperation({ summary: 'Get a product' })
  async get(@Param('id') id: string) {
    return this.products.toResponse(await this.products.getByPublicId(id), true);
  }

  @Post()
  @Permissions('product:create')
  @PlanQuota('max_products')
  @Validate(createProductRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a product' })
  async create(@Body() body: ReturnType<typeof createProductRequestSchema.parse>) {
    return this.products.toResponse(await this.products.create(body), true);
  }

  @Put(':id')
  @Permissions('product:update')
  @ApiOperation({ summary: 'Update a product' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductRequestSchema))
    body: ReturnType<typeof updateProductRequestSchema.parse>,
  ) {
    return this.products.toResponse(await this.products.update(id, body), true);
  }

  @Post(':id/publish')
  @Permissions('product:publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a product (sets status ACTIVE)' })
  async publish(@Param('id') id: string) {
    return this.products.toResponse(await this.products.update(id, { status: 'ACTIVE' }), true);
  }

  @Delete(':id')
  @Permissions('product:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.products.remove(id);
  }
}
