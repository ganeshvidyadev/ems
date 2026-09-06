import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  buildPaginationMeta,
  cmsPageListQuerySchema,
  createCmsPageRequestSchema,
  updateCmsPageRequestSchema,
} from '@ems/contracts';
import { NotFoundError } from '@ems/kernel';
import { Permissions, Public, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CmsPageService } from './cms-page.service';

@ApiTags('cms-pages')
@Controller({ version: '1' })
export class CmsPageController {
  constructor(private readonly pages: CmsPageService) {}

  @Get('console/cms/pages')
  @Permissions('cms:read')
  @ApiOperation({ summary: 'List CMS pages' })
  async list(
    @Query(new ZodValidationPipe(cmsPageListQuerySchema))
    query: ReturnType<typeof cmsPageListQuerySchema.parse>,
  ) {
    const { items, total } = await this.pages.list({
      page: query.page,
      limit: query.limit,
      storeId: query.storeId,
      status: query.status,
      sort: query.sort,
    });
    return new Paginated(
      await Promise.all(items.map((p) => this.pages.toResponse(p))),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get('console/cms/pages/:id')
  @Permissions('cms:read')
  @ApiOperation({ summary: 'Get a CMS page' })
  async get(@Param('id') id: string) {
    return this.pages.toResponse(await this.pages.getByPublicId(id));
  }

  @Post('console/cms/pages')
  @Permissions('cms:create')
  @Validate(createCmsPageRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a CMS page' })
  async create(@Body() body: ReturnType<typeof createCmsPageRequestSchema.parse>) {
    return this.pages.toResponse(await this.pages.create(body));
  }

  @Put('console/cms/pages/:id')
  @Permissions('cms:update')
  @Validate(updateCmsPageRequestSchema)
  @ApiOperation({ summary: 'Update a CMS page' })
  async update(@Param('id') id: string, @Body() body: ReturnType<typeof updateCmsPageRequestSchema.parse>) {
    return this.pages.toResponse(await this.pages.update(id, body));
  }

  @Post('console/cms/pages/:id/publish')
  @Permissions('cms:publish')
  @ApiOperation({ summary: 'Publish a CMS page' })
  async publish(@Param('id') id: string) {
    return this.pages.toResponse(await this.pages.update(id, { status: 'PUBLISHED' }));
  }

  @Delete('console/cms/pages/:id')
  @Permissions('cms:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a CMS page (system pages cannot be deleted)' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.pages.remove(id);
  }

  @Get('storefront/pages/:slug')
  @Public()
  @ApiOperation({ summary: 'Get a published CMS page by slug' })
  async bySlug(@Param('slug') slug: string, @Query('storeId') storeId: string) {
    const page = await this.pages.getBySlug(storeId, slug);
    if (!page) throw new NotFoundError('Page', slug);
    return this.pages.toResponse(page);
  }
}
