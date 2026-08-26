import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { TaxClassEntity, TaxRateEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class TaxClassRepository extends TenantScopedRepository<TaxClassEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, TaxClassEntity, context);
  }
}

@Injectable()
export class TaxRateRepository extends TenantScopedRepository<TaxRateEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, TaxRateEntity, context);
  }

  /**
   * The rate in force on a given date for a class/country/state, highest priority first.
   * `stateCode IS NULL` rows are country-wide fallbacks, so an exact-state match is
   * preferred by sorting state matches before nulls.
   */
  async resolveRate(
    taxClassId: string,
    countryCode: string,
    stateCode: string | null,
    onDate: string,
  ): Promise<TaxRateEntity | null> {
    const rows = await this.manager.query(
      `SELECT * FROM tax_rates
        WHERE tenant_id = ?
          AND tax_class_id = ?
          AND country_code = ?
          AND (state_code = ? OR state_code IS NULL)
          AND (effective_from IS NULL OR effective_from <= ?)
          AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY (state_code IS NULL) ASC, priority DESC
        LIMIT 1`,
      [this.tenantId, taxClassId, countryCode, stateCode, onDate, onDate],
    );
    const row = (rows as Record<string, unknown>[])[0];
    return row ? this.repository.create(this.mapRow(row)) : null;
  }

  private mapRow(row: Record<string, unknown>): Partial<TaxRateEntity> {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      taxClassId: String(row.tax_class_id),
      name: row.name as string,
      countryCode: row.country_code as string,
      stateCode: row.state_code as string | null,
      postalPattern: row.postal_pattern as string | null,
      rate: row.rate as string,
      compound: Boolean(row.compound),
      priority: row.priority as number,
      isInclusive: Boolean(row.is_inclusive),
      components: row.components as { name: string; rate: number }[] | null,
      effectiveFrom: row.effective_from as string | null,
      effectiveTo: row.effective_to as string | null,
    };
  }
}
