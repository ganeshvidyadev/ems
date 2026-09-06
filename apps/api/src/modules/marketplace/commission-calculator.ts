import { BusinessRuleError, Money, type CurrencyCode } from '@ems/kernel';
import type { CommissionType } from '../../database/entities';

export interface CommissionCalculationInput {
  commissionType: CommissionType;
  /** Percent (PERCENTAGE) or minor-currency flat amount per unit (FIXED). Unused for MARGIN. */
  commissionValue: string;
  /** Percent, always taken off the sale gross regardless of commission type. */
  platformFeeRate: string;
  /** The line's pre-tax merchandise value (line subtotal minus discount) — never includes tax. */
  gross: Money;
  quantity: number;
  /** Required for MARGIN: the supplier's cost basis for this line (unit cost × quantity). */
  supplierCostBasis?: Money | null;
}

export interface CommissionCalculationResult {
  /** What the reseller keeps for making the sale. */
  resellerCommission: Money;
  /** What the platform keeps, off the top, regardless of commission type. */
  platformFee: Money;
  /** What the reseller owes the supplier — always `gross - resellerCommission - platformFee`. */
  supplierNet: Money;
}

/**
 * The one place commission math happens — every euro/rupee of a marketplace
 * sale is split exactly three ways, and `supplierNet` is *defined* as the
 * remainder rather than computed independently, so the three results sum to
 * `gross` by construction. That identity is what makes the commission
 * ledger's double-entry rows balance to zero (docs/05's Phase 9 exit
 * criterion) — there is no code path where rounding or a missed case can
 * make the three shares disagree with the total.
 *
 * Tax is deliberately never part of this: `gross` is the pre-tax merchandise
 * value. GST/VAT remittance splitting across a supplier/reseller pair is a
 * real compliance question this does not attempt to answer — the tax stays
 * exactly where the order already put it (the reseller, who is the seller
 * of record to the customer).
 */
export function calculateCommission(input: CommissionCalculationInput): CommissionCalculationResult {
  const { commissionType, commissionValue, platformFeeRate, gross, quantity, supplierCostBasis } = input;
  const currency = gross.currency as CurrencyCode;

  const resellerCommission = clampToGross(computeResellerCommission(), gross);
  const platformFee = clampToGross(gross.percentage(platformFeeRate), gross);

  const supplierNet = gross.subtract(resellerCommission).subtract(platformFee);
  if (supplierNet.isNegative) {
    throw new BusinessRuleError(
      'Commission and platform fee exceed the sale gross — the product share\'s commission ' +
        'configuration would pay the supplier a negative amount',
      { grossMinor: gross.amountMinor.toString(), commissionType },
    );
  }

  return { resellerCommission, platformFee, supplierNet };

  function computeResellerCommission(): Money {
    switch (commissionType) {
      case 'PERCENTAGE':
        return gross.percentage(commissionValue);

      case 'FIXED':
        return Money.fromMinor(commissionValue, currency).multiplyByQuantity(quantity);

      case 'MARGIN': {
        if (!supplierCostBasis) {
          throw new BusinessRuleError('MARGIN commission requires the supplier\'s cost basis for this line');
        }
        const margin = gross.subtract(supplierCostBasis);
        return margin.isNegative ? Money.zero(currency) : margin;
      }

      default:
        throw new BusinessRuleError(`Unknown commission type: '${String(commissionType)}'`);
    }
  }
}

/** A misconfigured flat/margin value could otherwise exceed the sale itself — clamp rather than go negative downstream. */
function clampToGross(amount: Money, gross: Money): Money {
  return amount.greaterThan(gross) ? gross : amount;
}
