import { Injectable } from '@nestjs/common';
import type {
  CreateProductRequest,
  ProductListQuery,
  ProductResponse,
  UpdateProductRequest,
} from '@ems/contracts';
import { ConflictError, NotFoundError, newPublicId, uniqueSlug } from '@ems/kernel';
import { CacheService } from '../../common/services/cache.service';
import type { ProductEntity } from '../../database/entities';
import { ProductRepository } from './product.repository';
import { VariantRepository } from './variant.repository';
import { VariantService } from './services/variant.service';
import { AttributeService } from './services/attribute.service';
import { ProductEvent } from './events/product-events';

export interface HydratedProduct {
  product: ProductEntity;
  categoryIds: string[];
  primaryCategoryId: string | null;
}

@Injectable()
export class ProductService {
  constructor(
    private readonly products: ProductRepository,
    private readonly variantRepo: VariantRepository,
    private readonly variants: VariantService,
    private readonly attributes: AttributeService,
    private readonly cache: CacheService,
  ) {}

  async list(query: ProductListQuery): Promise<{ items: HydratedProduct[]; total: number }> {
    const [storeId, brandId, categoryId] = await Promise.all([
      query.storeId ? this.products.resolveId('stores', query.storeId) : undefined,
      query.brandId ? this.products.resolveId('brands', query.brandId) : undefined,
      query.categoryId ? this.products.resolveId('categories', query.categoryId) : undefined,
    ]);

    const { items, total } = await this.products.listing(
      {
        storeId: storeId ?? undefined,
        status: query.status,
        visibility: query.visibility,
        type: query.type,
        brandId: brandId ?? undefined,
        categoryId: categoryId ?? undefined,
        isFeatured: query.isFeatured,
      },
      query.sort,
      (query.page - 1) * query.limit,
      query.limit,
    );

    const hydrated = await Promise.all(items.map((product) => this.hydrateLinks(product)));
    return { items: hydrated, total };
  }

  async getByPublicId(publicId: string): Promise<HydratedProduct> {
    const product = await this.products.findByPublicIdOrFail(publicId);
    return this.hydrateLinks(product);
  }

  async hydrateMany(products: ProductEntity[]): Promise<HydratedProduct[]> {
    return Promise.all(products.map((product) => this.hydrateLinks(product)));
  }

  async create(input: CreateProductRequest): Promise<HydratedProduct> {
    const storeId = await this.products.resolveId('stores', input.storeId);
    if (!storeId) throw new NotFoundError('Store', input.storeId);

    const brandId = input.brandId ? await this.products.resolveId('brands', input.brandId) : null;
    const taxClassId = input.taxClassId ? await this.products.resolveId('tax_classes', input.taxClassId) : null;

    const slug = await uniqueSlug(input.slug ?? input.name, (candidate) =>
      this.products.slugExists(candidate, storeId),
    );

    if (input.sku && (await this.products.skuExists(input.sku))) {
      throw new ConflictError(`SKU '${input.sku}' is already in use`);
    }

    const now = new Date();
    const publishedAt = input.status === 'ACTIVE' ? now : null;

    const product = await this.products.transaction(async (repo) => {
      const created = await repo.insert({
        publicId: newPublicId(),
        storeId,
        brandId,
        taxClassId,
        type: input.type,
        name: input.name,
        slug,
        sku: input.type === 'VARIABLE' ? null : (input.sku ?? null),
        shortDescription: input.shortDescription ?? null,
        description: input.description ?? null,
        status: input.status,
        visibility: input.visibility,
        priceMinor: input.priceMinor,
        comparePriceMinor: input.comparePriceMinor ?? null,
        costPriceMinor: input.costPriceMinor ?? null,
        currency: input.currency,
        trackInventory: input.trackInventory,
        allowBackorder: input.allowBackorder,
        lowStockThreshold: input.lowStockThreshold ?? null,
        weightGrams: input.weightGrams ?? null,
        lengthMm: input.lengthMm ?? null,
        widthMm: input.widthMm ?? null,
        heightMm: input.heightMm ?? null,
        barcode: input.barcode ?? null,
        hsnCode: input.hsnCode ?? null,
        requiresShipping: input.requiresShipping,
        isFeatured: input.isFeatured,
        isShareable: input.isShareable,
        metaTitle: input.metaTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        metaKeywords: input.metaKeywords ?? null,
        attributes: input.attributes ?? null,
        publishedAt,
      });

      if (input.categoryIds && input.categoryIds.length > 0) {
        const idMap = await repo.resolveIds('categories', input.categoryIds);
        const internalIds = input.categoryIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id));
        const primaryInternal = input.primaryCategoryId ? (idMap.get(input.primaryCategoryId) ?? internalIds[0]) : internalIds[0];
        await repo.setCategoryLinks(created.id, internalIds, primaryInternal ?? null);
      }

      await repo.emitEvent({
        aggregateType: 'Product',
        aggregateId: created.id,
        eventType: ProductEvent.CREATED,
        payload: { productId: created.publicId, storeId: input.storeId, type: input.type },
      });

      if (publishedAt) {
        await repo.emitEvent({
          aggregateType: 'Product',
          aggregateId: created.id,
          eventType: ProductEvent.PUBLISHED,
          payload: { productId: created.publicId },
        });
      }

      return created;
    });

    if (input.type === 'VARIABLE' && input.variants) {
      await this.variants.replaceForProduct(product.id, input.variants);
    }
    if (input.attributeValues) {
      await this.attributes.setValuesForProduct(product.id, input.attributeValues);
    }

    await this.invalidate();
    return this.hydrateLinks(product);
  }

  async update(publicId: string, input: UpdateProductRequest): Promise<HydratedProduct> {
    const product = await this.products.findByPublicIdOrFail(publicId);

    const slug =
      input.slug && input.slug !== product.slug
        ? await uniqueSlug(input.slug, (candidate) => this.products.slugExists(candidate, product.storeId, publicId))
        : product.slug;

    if (input.sku && input.sku !== product.sku && (await this.products.skuExists(input.sku, publicId))) {
      throw new ConflictError(`SKU '${input.sku}' is already in use`);
    }

    const brandId =
      input.brandId !== undefined
        ? input.brandId
          ? await this.products.resolveId('brands', input.brandId)
          : null
        : product.brandId;
    const taxClassId =
      input.taxClassId !== undefined
        ? input.taxClassId
          ? await this.products.resolveId('tax_classes', input.taxClassId)
          : null
        : product.taxClassId;

    const wasPublished = product.publishedAt !== null;
    const willPublish = input.status === 'ACTIVE';
    const publishedAt = product.publishedAt ?? (willPublish ? new Date() : null);

    Object.assign(product, {
      brandId,
      taxClassId,
      name: input.name ?? product.name,
      slug,
      sku: input.sku ?? product.sku,
      shortDescription: input.shortDescription ?? product.shortDescription,
      description: input.description ?? product.description,
      status: input.status ?? product.status,
      visibility: input.visibility ?? product.visibility,
      priceMinor: input.priceMinor ?? product.priceMinor,
      comparePriceMinor: input.comparePriceMinor ?? product.comparePriceMinor,
      costPriceMinor: input.costPriceMinor ?? product.costPriceMinor,
      currency: input.currency ?? product.currency,
      trackInventory: input.trackInventory ?? product.trackInventory,
      allowBackorder: input.allowBackorder ?? product.allowBackorder,
      lowStockThreshold: input.lowStockThreshold ?? product.lowStockThreshold,
      weightGrams: input.weightGrams ?? product.weightGrams,
      lengthMm: input.lengthMm ?? product.lengthMm,
      widthMm: input.widthMm ?? product.widthMm,
      heightMm: input.heightMm ?? product.heightMm,
      barcode: input.barcode ?? product.barcode,
      hsnCode: input.hsnCode ?? product.hsnCode,
      requiresShipping: input.requiresShipping ?? product.requiresShipping,
      isFeatured: input.isFeatured ?? product.isFeatured,
      isShareable: input.isShareable ?? product.isShareable,
      metaTitle: input.metaTitle ?? product.metaTitle,
      metaDescription: input.metaDescription ?? product.metaDescription,
      metaKeywords: input.metaKeywords ?? product.metaKeywords,
      attributes: input.attributes ?? product.attributes,
      publishedAt,
    });

    await this.products.transaction(async (repo) => {
      await repo.save(product);

      if (input.categoryIds) {
        const idMap = await repo.resolveIds('categories', input.categoryIds);
        const internalIds = input.categoryIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id));
        const primaryInternal = input.primaryCategoryId ? (idMap.get(input.primaryCategoryId) ?? internalIds[0]) : internalIds[0];
        await repo.setCategoryLinks(product.id, internalIds, primaryInternal ?? null);
      }

      await repo.emitEvent({
        aggregateType: 'Product',
        aggregateId: product.id,
        eventType: ProductEvent.UPDATED,
        payload: { productId: product.publicId },
      });

      if (!wasPublished && willPublish) {
        await repo.emitEvent({
          aggregateType: 'Product',
          aggregateId: product.id,
          eventType: ProductEvent.PUBLISHED,
          payload: { productId: product.publicId },
        });
      }
    });

    if (input.attributeValues) {
      await this.attributes.setValuesForProduct(product.id, input.attributeValues);
    }

    await this.invalidate();
    return this.hydrateLinks(product);
  }

  async remove(publicId: string): Promise<void> {
    const product = await this.products.findByPublicIdOrFail(publicId);
    const links = await this.products.categoryIdsFor(product.id);

    await this.products.transaction(async (repo) => {
      await repo.softDeleteByPublicId(publicId);
      await repo.emitEvent({
        aggregateType: 'Product',
        aggregateId: product.id,
        eventType: ProductEvent.DELETED,
        payload: { productId: product.publicId },
      });
    });

    await this.products.recountCategoryProducts(links.map((l) => l.categoryId));
    await this.invalidate();
  }

  private async hydrateLinks(product: ProductEntity): Promise<HydratedProduct> {
    const links = await this.products.categoryIdsFor(product.id);
    const categoryPublicIds = await this.products.publicIdsForCategories(links.map((l) => l.categoryId));
    const primary = links.find((l) => l.isPrimary);

    return {
      product,
      categoryIds: links.map((l) => categoryPublicIds.get(l.categoryId) ?? l.categoryId),
      primaryCategoryId: primary ? (categoryPublicIds.get(primary.categoryId) ?? null) : null,
    };
  }

  private async invalidate(): Promise<void> {
    await this.cache.invalidateMany(['products']);
  }

  async toResponse(hydrated: HydratedProduct, includeCostPrice: boolean): Promise<ProductResponse> {
    const { product, categoryIds, primaryCategoryId } = hydrated;
    const variantEntities = product.type === 'VARIABLE' ? await this.variantRepo.findByProduct(product.id) : [];

    return {
      id: product.publicId,
      storeId: product.storeId,
      brandId: product.brandId,
      taxClassId: product.taxClassId,
      type: product.type,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      shortDescription: product.shortDescription,
      description: product.description,
      status: product.status,
      visibility: product.visibility,
      priceMinor: product.priceMinor,
      comparePriceMinor: product.comparePriceMinor,
      costPriceMinor: includeCostPrice ? product.costPriceMinor : undefined,
      currency: product.currency,
      trackInventory: product.trackInventory,
      allowBackorder: product.allowBackorder,
      lowStockThreshold: product.lowStockThreshold,
      barcode: product.barcode,
      hsnCode: product.hsnCode,
      requiresShipping: product.requiresShipping,
      isFeatured: product.isFeatured,
      isShareable: product.isShareable,
      metaTitle: product.metaTitle,
      metaDescription: product.metaDescription,
      metaKeywords: product.metaKeywords,
      attributes: product.attributes,
      ratingAverage: product.ratingAverage,
      ratingCount: product.ratingCount,
      publishedAt: product.publishedAt?.toISOString() ?? null,
      variants: variantEntities.map((v) => this.variants.toResponse(v, product.publicId)),
      categoryIds,
      primaryCategoryId,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
