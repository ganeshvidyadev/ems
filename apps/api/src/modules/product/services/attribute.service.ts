import { Injectable } from '@nestjs/common';
import type {
  CreateProductAttributeRequest,
  ProductAttributeResponse,
  SetProductAttributeValue,
} from '@ems/contracts';
import { ConflictError, NotFoundError, newPublicId } from '@ems/kernel';
import type { ProductAttributeEntity } from '../../../database/entities';
import { AttributeRepository, AttributeValueRepository } from '../attribute.repository';

@Injectable()
export class AttributeService {
  constructor(
    private readonly attributes: AttributeRepository,
    private readonly values: AttributeValueRepository,
  ) {}

  async list(): Promise<ProductAttributeEntity[]> {
    return this.attributes.find({ order: { sortOrder: 'ASC' } });
  }

  async create(input: CreateProductAttributeRequest): Promise<ProductAttributeEntity> {
    const existing = await this.attributes.findByCode(input.code);
    if (existing) throw new ConflictError(`Attribute code '${input.code}' already exists`);

    return this.attributes.insert({
      publicId: newPublicId(),
      code: input.code,
      name: input.name,
      inputType: input.inputType,
      isVariantOption: input.isVariantOption,
      isFilterable: input.isFilterable,
      sortOrder: input.sortOrder,
    });
  }

  /** Resolves attribute codes to internal ids and writes the product's normalized values. */
  async setValuesForProduct(productId: string, inputs: SetProductAttributeValue[]): Promise<void> {
    const resolved: {
      attributeId: string;
      valueText: string | null;
      valueNumber: string | null;
      valueBool: boolean | null;
    }[] = [];

    for (const input of inputs) {
      const attribute = await this.attributes.findByCode(input.attributeCode);
      if (!attribute) throw new NotFoundError('ProductAttribute', input.attributeCode);

      resolved.push({
        attributeId: attribute.id,
        valueText: input.valueText ?? null,
        valueNumber: input.valueNumber !== undefined ? String(input.valueNumber) : null,
        valueBool: input.valueBool ?? null,
      });
    }

    await this.values.replaceForProduct(productId, resolved);
  }

  toResponse(attribute: ProductAttributeEntity): ProductAttributeResponse {
    return {
      id: attribute.publicId,
      code: attribute.code,
      name: attribute.name,
      inputType: attribute.inputType,
      isVariantOption: attribute.isVariantOption,
      isFilterable: attribute.isFilterable,
      sortOrder: attribute.sortOrder,
    };
  }
}
