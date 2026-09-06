import { Injectable } from '@nestjs/common';
import { Money, type CurrencyCode } from '@ems/kernel';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';

interface TaxRateRow {
  id: string;
  name: string;
  rate: string;
  isInclusive: number;
  components: { name: string; rate: number }[] | null;
}

export interface LineTax {
  taxRate: string;
  taxMinor: Money;
  breakup: { name: string; rate: string; amountMinor: string }[];
}

/**
 * Minimal GST-shaped tax engine: one best-matching `tax_rates` row per
 * product's tax class, resolved against the shipping address's country/state
 * and today's date (docs/02 §13's `effective_from`/`effective_to`).
 *
 * Deliberately not the full engine the roadmap describes for later phases
 * (multi-jurisdiction stacking, marketplace-aware splits) — this is enough to
 * make GST-inclusive/exclusive pricing and the CGST/SGST breakup on an
 * invoice line correct for a single-country storefront today.
 */
@Injectable()
export class TaxCalculatorService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly context: RequestContextService,
  ) {}

  async computeLineTax(
    taxClassId: string | null,
    lineAmount: Money,
    countryCode: string,
    stateCode: string | null,
  ): Promise<LineTax> {
    const currency = lineAmount.currency;
    const zero: LineTax = { taxRate: '0', taxMinor: Money.zero(currency), breakup: [] };
    if (!taxClassId || lineAmount.isZero) return zero;

    const tenantId = this.context.requireTenantId('tax calculation');
    const today = new Date().toISOString().slice(0, 10);

    const rows = (await this.manager.query(
      `SELECT id, name, rate, is_inclusive AS isInclusive, components
         FROM tax_rates
        WHERE tenant_id = ? AND tax_class_id = ? AND country_code = ?
          AND (state_code = ? OR state_code IS NULL)
          AND (effective_from IS NULL OR effective_from <= ?)
          AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY (state_code IS NOT NULL) DESC, priority DESC
        LIMIT 1`,
      [tenantId, taxClassId, countryCode, stateCode, today, today],
    )) as TaxRateRow[];

    const row = rows[0];
    if (!row) return zero;

    const taxMinor = row.isInclusive === 1
      ? this.backOutInclusiveTax(lineAmount, row.rate)
      : lineAmount.percentage(row.rate);

    const breakup = this.splitComponents(taxMinor, row.components, row.name, row.rate);

    return { taxRate: row.rate, taxMinor, breakup };
  }

  /** `price * rate / (100 + rate)` — the tax portion already folded into an inclusive price. */
  private backOutInclusiveTax(lineAmount: Money, ratePercent: string): Money {
    const rate = Number(ratePercent);
    const numerator = BigInt(Math.round(rate * 10_000));
    const denominator = BigInt(Math.round((100 + rate) * 10_000));
    return lineAmount.multiplyByRatio(numerator, denominator);
  }

  /** Splits the computed total across CGST/SGST-style components by their relative rates. */
  private splitComponents(
    total: Money,
    components: { name: string; rate: number }[] | null,
    fallbackName: string,
    fallbackRate: string,
  ): { name: string; rate: string; amountMinor: string }[] {
    if (!components || components.length === 0) {
      return [{ name: fallbackName, rate: fallbackRate, amountMinor: total.amountMinor.toString() }];
    }

    const shares = total.allocate(components.map((c) => BigInt(Math.round(c.rate * 100))));
    return components.map((c, i) => ({
      name: c.name,
      rate: String(c.rate),
      amountMinor: (shares[i] ?? Money.zero(total.currency)).amountMinor.toString(),
    }));
  }
}

export type { CurrencyCode };
