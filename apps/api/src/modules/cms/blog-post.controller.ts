import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  blogPostListQuerySchema,
  buildPaginationMeta,
  createBlogPostRequestSchema,
  updateBlogPostRequestSchema,
} from '@ems/contracts';
import { NotFoundError } from '@ems/kernel';
import { Permissions, Public, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BlogPostService } from './blog-post.service';

@ApiTags('blog')
@Controller({ version: '1' })
export class BlogPostController {
  constructor(private readonly posts: BlogPostService) {}

  @Get('console/blog/posts')
  @Permissions('blog:read')
  @ApiOperation({ summary: 'List blog posts' })
  async list(
    @Query(new ZodValidationPipe(blogPostListQuerySchema))
    query: ReturnType<typeof blogPostListQuerySchema.parse>,
  ) {
    const { items, total } = await this.posts.list({
      page: query.page,
      limit: query.limit,
      storeId: query.storeId,
      status: query.status,
      category: query.category,
      sort: query.sort,
    });
    return new Paginated(
      await Promise.all(items.map((p) => this.posts.toResponse(p))),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get('console/blog/posts/:id')
  @Permissions('blog:read')
  @ApiOperation({ summary: 'Get a blog post' })
  async get(@Param('id') id: string) {
    return this.posts.toResponse(await this.posts.getByPublicId(id));
  }

  @Post('console/blog/posts')
  @Permissions('blog:create')
  @Validate(createBlogPostRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a blog post' })
  async create(@Body() body: ReturnType<typeof createBlogPostRequestSchema.parse>) {
    return this.posts.toResponse(await this.posts.create(body));
  }

  @Put('console/blog/posts/:id')
  @Permissions('blog:update')
  @Validate(updateBlogPostRequestSchema)
  @ApiOperation({ summary: 'Update a blog post' })
  async update(@Param('id') id: string, @Body() body: ReturnType<typeof updateBlogPostRequestSchema.parse>) {
    return this.posts.toResponse(await this.posts.update(id, body));
  }

  @Post('console/blog/posts/:id/publish')
  @Permissions('blog:publish')
  @ApiOperation({ summary: 'Publish a blog post' })
  async publish(@Param('id') id: string) {
    return this.posts.toResponse(await this.posts.update(id, { status: 'PUBLISHED' }));
  }

  @Delete('console/blog/posts/:id')
  @Permissions('blog:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a blog post' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.posts.remove(id);
  }

  @Get('storefront/blog/:slug')
  @Public()
  @ApiOperation({ summary: 'Get a published blog post by slug (counts a view)' })
  async bySlug(@Param('slug') slug: string, @Query('storeId') storeId: string) {
    const post = await this.posts.getBySlug(storeId, slug, true);
    if (!post) throw new NotFoundError('Blog post', slug);
    return this.posts.toResponse(post);
  }
}
