import { Module } from '@nestjs/common';
import { CmsPageController } from './cms-page.controller';
import { CmsPageRepository } from './cms-page.repository';
import { CmsPageService } from './cms-page.service';
import { BlogPostController } from './blog-post.controller';
import { BlogPostRepository } from './blog-post.repository';
import { BlogPostService } from './blog-post.service';

@Module({
  controllers: [CmsPageController, BlogPostController],
  providers: [CmsPageRepository, CmsPageService, BlogPostRepository, BlogPostService],
  exports: [CmsPageService, BlogPostService],
})
export class CmsModule {}
