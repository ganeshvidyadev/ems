import { Injectable } from '@nestjs/common';
import type { BrandResponse, CreateBrandRequest, UpdateBrandRequest } from '@ems/contracts';
import { newPublicId, slugify, uniqueSlug } from '@ems/kernel';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';
import { CacheService } from '../../common/services/cache.service';
import { BrandRepository } from './brand.repository';
import type { BrandEntity } from '../../database/entities';

@Injectable()
export class BrandService {
  constructor(
    private readonly brands: BrandRepository,
    private readonly cache: CacheService,
  ) {}

  async list(query: {
    page: number;
    limit: number;
    isActive?: boolean;
    sort: { field: string; direction: 'ASC' | 'DESC' }[];
  }): Promise<PaginatedResult<BrandEntity>> {
    return this.brands.findAndCount({
      where: query.isActive === undefined ? {} : { isActive: query.isActive },
      order: Object.fromEntries(query.sort.map((s) => [s.field, s.direction])),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  async getByPublicId(publicId: string): Promise<BrandEntity> {
    return this.brands.findByPublicIdOrFail(publicId);
  }

  async create(input: CreateBrandRequest): Promise<BrandEntity> {
    const slug = await uniqueSlug(input.slug ?? input.name, (candidate) =>
      this.brands.slugExists(candidate),
    );

    const brand = await this.brands.insert({
      publicId: newPublicId(),
      name: input.name,
      slug,
      logoUrl: input.logoUrl ?? null,
      description: input.description ?? null,
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      isActive: input.isActive,
    });

    await this.invalidate();
    return brand;
  }

  async update(publicId: string, input: UpdateBrandRequest): Promise<BrandEntity> {
    const brand = await this.brands.findByPublicIdOrFail(publicId);

    const slug =
      input.slug && input.slug !== brand.slug
        ? await uniqueSlug(input.slug, (candidate) => this.brands.slugExists(candidate, publicId))
        : brand.slug;

    Object.assign(brand, {
      name: input.name ?? brand.name,
      slug,
      logoUrl: input.logoUrl ?? brand.logoUrl,
      description: input.description ?? brand.description,
      metaTitle: input.metaTitle ?? brand.metaTitle,
      metaDescription: input.metaDescription ?? brand.metaDescription,
      isActive: input.isActive ?? brand.isActive,
    });

    await this.brands.save(brand);
    await this.invalidate();
    return brand;
  }

  async remove(publicId: string): Promise<void> {
    await this.brands.softDeleteByPublicId(publicId);
    await this.invalidate();
  }

  private async invalidate(): Promise<void> {
    // Products denormalize nothing about their brand, but listings filter by brand id,
    // so a rename/deactivate must not be served stale from the product cache either.
    await this.cache.invalidateMany(['brands', 'products']);
  }

  toResponse(brand: BrandEntity): BrandResponse {
    return {
      id: brand.publicId,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      description: brand.description,
      metaTitle: brand.metaTitle,
      metaDescription: brand.metaDescription,
      isActive: brand.isActive,
      createdAt: brand.createdAt.toISOString(),
      updatedAt: brand.updatedAt.toISOString(),
    };
  }
}
