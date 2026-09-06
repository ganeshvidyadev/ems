import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { BlogPostEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class BlogPostRepository extends TenantScopedRepository<BlogPostEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, BlogPostEntity, context);
  }

  async slugExists(storeId: string, slug: string, excludePublicId?: string): Promise<boolean> {
    const existing = await this.findOne({ where: { storeId, slug } });
    if (!existing) return false;
    return existing.publicId !== excludePublicId;
  }

  async findBySlug(storeId: string, slug: string): Promise<BlogPostEntity | null> {
    return this.findOne({ where: { storeId, slug, status: 'PUBLISHED' } });
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.manager.query(
      `UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ? AND tenant_id = ?`,
      [id, this.tenantId],
    );
  }
}
