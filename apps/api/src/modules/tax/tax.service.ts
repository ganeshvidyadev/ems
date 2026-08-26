import { Injectable } from '@nestjs/common';
import type {
  CreateTaxClassRequest,
  CreateTaxRateRequest,
  TaxClassResponse,
  TaxRateResponse,
  UpdateTaxClassRequest,
  UpdateTaxRateRequest,
} from '@ems/contracts';
import { newPublicId } from '@ems/kernel';
import type { TaxClassEntity, TaxRateEntity } from '../../database/entities';
import { TaxClassRepository, TaxRateRepository } from './tax.repository';

@Injectable()
export class TaxService {
  constructor(
    private readonly classes: TaxClassRepository,
    private readonly rates: TaxRateRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // Classes
  // ---------------------------------------------------------------------------

  async listClasses(): Promise<TaxClassEntity[]> {
    return this.classes.find({ order: { code: 'ASC' } });
  }

  async getClass(publicId: string): Promise<TaxClassEntity> {
    return this.classes.findByPublicIdOrFail(publicId);
  }

  async createClass(input: CreateTaxClassRequest): Promise<TaxClassEntity> {
    return this.classes.insert({ publicId: newPublicId(), ...input });
  }

  async updateClass(publicId: string, input: UpdateTaxClassRequest): Promise<TaxClassEntity> {
    const taxClass = await this.classes.findByPublicIdOrFail(publicId);
    Object.assign(taxClass, {
      name: input.name ?? taxClass.name,
      isDefault: input.isDefault ?? taxClass.isDefault,
    });
    await this.classes.save(taxClass);
    return taxClass;
  }

  async removeClass(publicId: string): Promise<void> {
    const taxClass = await this.classes.findByPublicIdOrFail(publicId);
    await this.classes.hardDelete({ id: taxClass.id });
  }

  // ---------------------------------------------------------------------------
  // Rates
  // ---------------------------------------------------------------------------

  async listRates(taxClassPublicId?: string): Promise<TaxRateEntity[]> {
    if (!taxClassPublicId) return this.rates.find({ order: { priority: 'DESC' } });
    const taxClass = await this.classes.findByPublicIdOrFail(taxClassPublicId);
    return this.rates.find({ where: { taxClassId: taxClass.id }, order: { priority: 'DESC' } });
  }

  async createRate(input: CreateTaxRateRequest): Promise<TaxRateEntity> {
    const taxClass = await this.classes.findByPublicIdOrFail(input.taxClassId);
    return this.rates.insert({
      publicId: newPublicId(),
      taxClassId: taxClass.id,
      name: input.name,
      countryCode: input.countryCode,
      stateCode: input.stateCode ?? null,
      postalPattern: input.postalPattern ?? null,
      rate: String(input.rate),
      compound: input.compound,
      priority: input.priority,
      isInclusive: input.isInclusive,
      components: input.components ?? null,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
    });
  }

  async updateRate(publicId: string, input: UpdateTaxRateRequest): Promise<TaxRateEntity> {
    const rate = await this.rates.findByPublicIdOrFail(publicId);
    Object.assign(rate, {
      name: input.name ?? rate.name,
      countryCode: input.countryCode ?? rate.countryCode,
      stateCode: input.stateCode ?? rate.stateCode,
      postalPattern: input.postalPattern ?? rate.postalPattern,
      rate: input.rate !== undefined ? String(input.rate) : rate.rate,
      compound: input.compound ?? rate.compound,
      priority: input.priority ?? rate.priority,
      isInclusive: input.isInclusive ?? rate.isInclusive,
      components: input.components ?? rate.components,
      effectiveFrom: input.effectiveFrom ?? rate.effectiveFrom,
      effectiveTo: input.effectiveTo ?? rate.effectiveTo,
    });
    await this.rates.save(rate);
    return rate;
  }

  async removeRate(publicId: string): Promise<void> {
    const rate = await this.rates.findByPublicIdOrFail(publicId);
    await this.rates.hardDelete({ id: rate.id } as never);
  }

  /** Resolves the effective rate for checkout/invoicing — Phase 5 wires this in. */
  async resolveRate(
    taxClassPublicId: string,
    countryCode: string,
    stateCode: string | null,
    onDate: string,
  ): Promise<TaxRateEntity | null> {
    const taxClass = await this.classes.findByPublicIdOrFail(taxClassPublicId);
    return this.rates.resolveRate(taxClass.id, countryCode, stateCode, onDate);
  }

  toClassResponse(taxClass: TaxClassEntity): TaxClassResponse {
    return {
      id: taxClass.publicId,
      code: taxClass.code,
      name: taxClass.name,
      isDefault: taxClass.isDefault,
      createdAt: taxClass.createdAt.toISOString(),
    };
  }

  async toRateResponse(rate: TaxRateEntity): Promise<TaxRateResponse> {
    const taxClass = await this.classes.findOne({ where: { id: rate.taxClassId } });
    return {
      id: rate.publicId,
      taxClassId: taxClass?.publicId ?? '',
      name: rate.name,
      countryCode: rate.countryCode,
      stateCode: rate.stateCode,
      postalPattern: rate.postalPattern,
      rate: rate.rate,
      compound: rate.compound,
      priority: rate.priority,
      isInclusive: rate.isInclusive,
      components: rate.components,
      effectiveFrom: rate.effectiveFrom,
      effectiveTo: rate.effectiveTo,
      createdAt: rate.createdAt.toISOString(),
    };
  }
}
