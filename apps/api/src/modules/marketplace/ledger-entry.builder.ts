import type { Money } from '@ems/kernel';
import { newPublicId } from '@ems/kernel';
import type { CommissionLedgerEntity } from '../../database/entities';

export interface LedgerEntryGroupInput {
  orderId: string;
  orderItemId: string | null;
  supplierTenantId: string;
  resellerTenantId: string;
  gross: Money;
  resellerCommission: Money;
  platformFee: Money;
  supplierNet: Money;
  correlationId: string | null;
}

/**
 * Builds the four-row double-entry group for one marketplace sale line.
 *
 * The reseller is modelled as receiving the customer's full payment (they
 * are the seller of record — the order lives in their tenant) and then
 * owing the supplier and the platform their shares:
 *
 *   DEBIT  reseller  gross              — money received
 *   CREDIT reseller  resellerCommission — money kept
 *   CREDIT supplier  supplierNet        — money owed out
 *   CREDIT platform  platformFee        — money owed out
 *
 * Debits and credits both sum to `gross` by construction (`calculateCommission`
 * defines `supplierNet` as the remainder), so this group alone balances to
 * zero — the property `SettlementService`'s reconciliation depends on.
 */
export function buildSaleLedgerEntries(input: LedgerEntryGroupInput): Partial<CommissionLedgerEntity>[] {
  const { orderId, orderItemId, supplierTenantId, resellerTenantId, gross, resellerCommission, platformFee, supplierNet, correlationId } =
    input;
  const currency = gross.currency;
  const groupId = newPublicId();
  const zero = '0';

  const base: Partial<CommissionLedgerEntity> = {
    orderId,
    orderItemId,
    supplierTenantId,
    resellerTenantId,
    grossMinor: gross.amountMinor.toString(),
    taxMinor: zero,
    currency,
    correlationId,
    description: `Marketplace sale — order ${orderId}, group ${groupId}`,
  };

  return [
    {
      ...base,
      publicId: newPublicId(),
      entryType: 'SALE',
      direction: 'DEBIT',
      beneficiaryType: 'RESELLER',
      beneficiaryTenantId: resellerTenantId,
      commissionMinor: zero,
      platformFeeMinor: zero,
      netMinor: gross.amountMinor.toString(),
    },
    {
      ...base,
      publicId: newPublicId(),
      entryType: 'COMMISSION',
      direction: 'CREDIT',
      beneficiaryType: 'RESELLER',
      beneficiaryTenantId: resellerTenantId,
      commissionMinor: resellerCommission.amountMinor.toString(),
      platformFeeMinor: zero,
      netMinor: resellerCommission.amountMinor.toString(),
    },
    {
      ...base,
      publicId: newPublicId(),
      entryType: 'SALE',
      direction: 'CREDIT',
      beneficiaryType: 'SUPPLIER',
      beneficiaryTenantId: supplierTenantId,
      commissionMinor: zero,
      platformFeeMinor: zero,
      netMinor: supplierNet.amountMinor.toString(),
    },
    {
      ...base,
      publicId: newPublicId(),
      entryType: 'PLATFORM_FEE',
      direction: 'CREDIT',
      beneficiaryType: 'PLATFORM',
      beneficiaryTenantId: null,
      commissionMinor: zero,
      platformFeeMinor: platformFee.amountMinor.toString(),
      netMinor: platformFee.amountMinor.toString(),
    },
  ];
}

/**
 * Builds a reversal group for a refund — one mirrored (opposite-direction)
 * entry per original row, each pointing back via `reversesEntryId`.
 * `settlementId` is deliberately never copied from the original: a reversal
 * is always unsettled, so it lands in whatever period comes next rather
 * than mutating a period that has already been paid.
 */
export function buildReversalLedgerEntries(
  originals: CommissionLedgerEntity[],
  proportion: { numerator: bigint; denominator: bigint },
  correlationId: string | null,
): Partial<CommissionLedgerEntity>[] {
  return originals.map((original) => {
    const reversedNet =
      (BigInt(original.netMinor) * proportion.numerator) / proportion.denominator;
    const reversedGross =
      (BigInt(original.grossMinor) * proportion.numerator) / proportion.denominator;
    const reversedCommission =
      (BigInt(original.commissionMinor) * proportion.numerator) / proportion.denominator;
    const reversedPlatformFee =
      (BigInt(original.platformFeeMinor) * proportion.numerator) / proportion.denominator;

    return {
      publicId: newPublicId(),
      orderId: original.orderId,
      orderItemId: original.orderItemId,
      supplierTenantId: original.supplierTenantId,
      resellerTenantId: original.resellerTenantId,
      entryType: 'REFUND_REVERSAL',
      direction: original.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      beneficiaryType: original.beneficiaryType,
      beneficiaryTenantId: original.beneficiaryTenantId,
      grossMinor: reversedGross.toString(),
      commissionMinor: reversedCommission.toString(),
      platformFeeMinor: reversedPlatformFee.toString(),
      taxMinor: '0',
      netMinor: reversedNet.toString(),
      currency: original.currency,
      settlementId: null,
      reversesEntryId: original.id,
      correlationId,
      description: `Refund reversal of ledger entry ${original.publicId}`,
    };
  });
}
