import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { BusinessRuleError, Money, type CurrencyCode } from '@ems/kernel';
import type { ChannelEntity, ChannelListingEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { ChannelAdapterFactory } from '../../integrations/channel/channel-adapter.factory';
import { ChannelListingRepository } from './channel-listing.repository';
import { ChannelRepository } from './channel.repository';
import { ChannelService } from './channel.service';
import { fetchAvailableStock } from './product-stock.util';

interface PublishableProductRow {
  id: string;
  name: string;
  shortDescription: string | null;
  sku: string | null;
  priceMinor: string;
  currency: string;
  categoryName: string | null;
}

interface PublishableVariantRow {
  id: string;
  sku: string;
  priceMinor: string;
}

/** Applies the channel's own price-adjustment rule — a percent markup then a flat add-on, both optional. */
export function applyChannelPriceRule(priceMinor: string, currency: CurrencyCode, settings: ChannelEntity['settings']): Money {
  let price = Money.fromMinor(priceMinor, currency);
  if (settings?.priceAdjustmentPercent) {
    price = price.add(price.percentage(settings.priceAdjustmentPercent));
  }
  if (settings?.priceAdjustmentFlatMinor) {
    price = price.add(Money.fromMinor(settings.priceAdjustmentFlatMinor, currency));
  }
  return price;
}

/**
 * Publishes one product (or variant) to one channel — category mapping and
 * price rules come from `channel.settings`, resolved here so the adapter
 * itself never has to know about our catalog's own category names.
 */
@Injectable()
export class ListingPublishService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly channels: ChannelRepository,
    private readonly listings: ChannelListingRepository,
    private readonly channelService: ChannelService,
    private readonly adapters: ChannelAdapterFactory,
    private readonly context: RequestContextService,
  ) {}

  async publish(channelId: string, productPublicId: string, variantPublicId: string | null): Promise<ChannelListingEntity> {
    const channel = await this.channels.findOneOrFail({ where: { id: channelId } });
    if (!channel.isConnected) throw new BusinessRuleError(`Channel '${channel.name}' is not connected`);

    const adapter = this.adapters.resolve(channel.type);
    const credentials = this.channelService.decryptCredentials(channel);

    const product = await this.mustFindProduct(productPublicId);
    const variant = variantPublicId ? await this.mustFindVariant(variantPublicId) : null;
    const images = await this.productImages(product.id);
    const stockQty = await fetchAvailableStock(this.manager, product.id, variant?.id ?? null);

    const externalSku = variant?.sku ?? product.sku ?? `PROD-${product.id}`;
    const categoryId = product.categoryName ? channel.settings?.categoryMapping?.[product.categoryName] ?? null : null;
    const priceMinor = variant?.priceMinor ?? product.priceMinor;
    const adjustedPrice = applyChannelPriceRule(priceMinor, product.currency as CurrencyCode, channel.settings);

    let listing = await this.listings.findForChannelAndProduct(channelId, product.id, variant?.id ?? null);
    listing = listing
      ? Object.assign(listing, { status: 'PUBLISHING' as const })
      : this.listings.create({ channelId, productId: product.id, variantId: variant?.id ?? null, status: 'PUBLISHING', externalSku });
    listing = await this.listings.saveOne(listing);

    try {
      const result = await adapter.publishListing(credentials, {
        externalSku,
        title: product.name,
        description: product.shortDescription,
        priceMinor: adjustedPrice.amountMinor.toString(),
        currency: product.currency,
        quantity: stockQty,
        categoryId,
        images,
        marketplaceId: channel.marketplaceId,
      });

      listing.externalListingId = result.externalListingId;
      listing.externalSku = externalSku;
      listing.channelPriceMinor = adjustedPrice.amountMinor.toString();
      listing.channelTitle = product.name;
      listing.categoryMapping = categoryId;
      listing.status = result.status;
      listing.errorMessage = result.errorMessage ?? null;
      listing.errorCode = result.status === 'REJECTED' ? 'REJECTED' : null;
      listing.lastPublishedAt = new Date();
    } catch (error) {
      listing.status = 'ERROR';
      listing.errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      listing.errorCode = 'PUBLISH_FAILED';
    }

    return this.listings.saveOne(listing);
  }

  async delist(listingId: string): Promise<ChannelListingEntity> {
    const listing = await this.listings.findOneOrFail({ where: { id: listingId } });
    listing.status = 'DELISTED';
    return this.listings.saveOne(listing);
  }

  private async mustFindProduct(productPublicId: string): Promise<PublishableProductRow> {
    const rows = (await this.manager.query(
      `SELECT p.id, p.name, p.short_description AS shortDescription, p.sku,
              p.price_minor AS priceMinor, p.currency, c.name AS categoryName
         FROM products p
         LEFT JOIN product_categories pc ON pc.product_id = p.id AND pc.is_primary = 1
         LEFT JOIN categories c ON c.id = pc.category_id
        WHERE p.public_id = ? AND p.tenant_id = ? LIMIT 1`,
      [productPublicId, this.context.requireTenantId('publish listing')],
    )) as PublishableProductRow[];
    const product = rows[0];
    if (!product) throw new BusinessRuleError(`Product '${productPublicId}' not found`);
    return product;
  }

  private async mustFindVariant(variantPublicId: string): Promise<PublishableVariantRow> {
    const rows = (await this.manager.query(
      `SELECT id, sku, price_minor AS priceMinor FROM product_variants WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [variantPublicId, this.context.requireTenantId('publish listing')],
    )) as PublishableVariantRow[];
    const variant = rows[0];
    if (!variant) throw new BusinessRuleError(`Variant '${variantPublicId}' not found`);
    return variant;
  }

  private async productImages(productId: string): Promise<string[]> {
    const rows = (await this.manager.query(
      `SELECT url FROM product_media WHERE product_id = ? ORDER BY is_primary DESC, position ASC LIMIT 12`,
      [productId],
    )) as { url: string }[];
    return rows.map((r) => r.url);
  }
}
