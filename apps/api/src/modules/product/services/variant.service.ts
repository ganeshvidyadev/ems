import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { CreateVariantRequest, VariantResponse } from '@ems/contracts';
import { ConflictError, newPublicId } from '@ems/kernel';
import type { ProductVariantEntity } from '../../../database/entities';
import { VariantRepository } from '../variant.repository';

/**
 * `option_signature` — SHA-256 of the option entries sorted by key, so `{color:Blue,size:L}`
 * and `{size:L,color:Blue}` collide to the same signature. The real duplicate-combination
 * guard is `UNIQUE(product_id, option_signature)` in the database; this check exists only
 * to turn that into a clean 409 instead of a raw MySQL duplicate-key error surfacing to
 * the merchant.
 */
export function computeOptionSignature(optionValues: Record<string, string>): string {
  const sorted = Object.keys(optionValues)
    .sort()
    .map((key) => [key, optionValues[key]] as const);
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

@Injectable()
export class VariantService {
  constructor(private readonly variants: VariantRepository) {}

  async replaceForProduct(
    productId: string,
    inputs: CreateVariantRequest[],
  ): Promise<ProductVariantEntity[]> {
    const existing = await this.variants.findByProduct(productId);
    const existingByOptionSig = new Map(existing.map((v) => [v.optionSignature, v]));

    const seenSignatures = new Set<string>();
    const results: ProductVariantEntity[] = [];

    for (const [index, input] of inputs.entries()) {
      const optionSignature = computeOptionSignature(input.optionValues);
      if (seenSignatures.has(optionSignature)) {
        throw new ConflictError(
          `Duplicate variant option combination: ${JSON.stringify(input.optionValues)}`,
        );
      }
      seenSignatures.add(optionSignature);

      if (await this.variants.skuExists(input.sku, existingByOptionSig.get(optionSignature)?.publicId)) {
        throw new ConflictError(`SKU '${input.sku}' is already in use`);
      }

      const current = existingByOptionSig.get(optionSignature);
      if (current) {
        Object.assign(current, {
          sku: input.sku,
          barcode: input.barcode ?? null,
          title: input.title ?? deriveTitle(input.optionValues),
          optionValues: input.optionValues,
          priceMinor: input.priceMinor,
          comparePriceMinor: input.comparePriceMinor ?? null,
          costPriceMinor: input.costPriceMinor ?? null,
          weightGrams: input.weightGrams ?? null,
          position: input.position ?? index,
          isActive: input.isActive,
        });
        await this.variants.save(current);
        results.push(current);
        existingByOptionSig.delete(optionSignature);
      } else {
        const created = await this.variants.insert({
          publicId: newPublicId(),
          productId,
          sku: input.sku,
          barcode: input.barcode ?? null,
          title: input.title ?? deriveTitle(input.optionValues),
          optionValues: input.optionValues,
          optionSignature,
          priceMinor: input.priceMinor,
          comparePriceMinor: input.comparePriceMinor ?? null,
          costPriceMinor: input.costPriceMinor ?? null,
          weightGrams: input.weightGrams ?? null,
          position: input.position ?? index,
          isActive: input.isActive,
        });
        results.push(created);
      }
    }

    // Anything left in the map was not present in this write — remove it.
    for (const stale of existingByOptionSig.values()) {
      await this.variants.softDeleteByPublicId(stale.publicId);
    }

    return results;
  }

  toResponse(variant: ProductVariantEntity, productPublicId: string): VariantResponse {
    return {
      id: variant.publicId,
      productId: productPublicId,
      sku: variant.sku,
      barcode: variant.barcode,
      title: variant.title,
      optionValues: variant.optionValues,
      priceMinor: variant.priceMinor,
      comparePriceMinor: variant.comparePriceMinor,
      position: variant.position,
      isActive: variant.isActive,
    };
  }
}

function deriveTitle(optionValues: Record<string, string>): string {
  return Object.values(optionValues).join(' / ');
}
