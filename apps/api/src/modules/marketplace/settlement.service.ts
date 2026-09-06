import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { BusinessRuleError, ConflictError, Money, NotFoundError, type CurrencyCode } from '@ems/kernel';
import type { SettlementResponse } from '@ems/contracts';
import { RequestContextService } from '../../common/services/request-context.service';
import type { SettlementEntity } from '../../database/entities';
import { CommissionLedgerRepository } from './commission-ledger.repository';
import { SettlementRepository } from './settlement.repository';
import { runAsTenant } from '../../common/utils/run-as-tenant.util';

export interface SettlementRunResult {
  created: SettlementEntity[];
  skipped: { beneficiaryTenantId: string; reason: string }[];
}

/**
 * Batches unsettled commission-ledger entries into per-beneficiary
 * settlements, then carries one through approval to payout.
 *
 * The run itself is a platform/system operation — it has no single tenant
 * of its own, and writes one settlement row per beneficiary tenant found
 * with unsettled entries, each under a brief context switch to that
 * tenant (`runAsTenant`) since `SettlementEntity` is genuinely
 * tenant-owned (see its own doc comment).
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly settlements: SettlementRepository,
    private readonly ledger: CommissionLedgerRepository,
    private readonly context: RequestContextService,
  ) {}

  async runBatch(periodStart: string, periodEnd: string): Promise<SettlementRunResult> {
    const upTo = new Date(`${periodEnd}T23:59:59.999Z`);
    const beneficiaries = await this.ledger.findBeneficiariesWithUnsettledEntries(upTo);

    const created: SettlementEntity[] = [];
    const skipped: { beneficiaryTenantId: string; reason: string }[] = [];

    for (const beneficiaryTenantId of beneficiaries) {
      try {
        const settlement = await this.createSettlementForBeneficiary(beneficiaryTenantId, periodStart, periodEnd, upTo);
        if (settlement) created.push(settlement);
        else skipped.push({ beneficiaryTenantId, reason: 'No unsettled entries by the time the batch ran' });
      } catch (error) {
        // One tenant's bad data (a currency mismatch across its entries, say)
        // must not stop every other tenant's settlement from being created.
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`Settlement batch failed for tenant ${beneficiaryTenantId}: ${reason}`);
        skipped.push({ beneficiaryTenantId, reason });
      }
    }

    return { created, skipped };
  }

  private async createSettlementForBeneficiary(
    beneficiaryTenantId: string,
    periodStart: string,
    periodEnd: string,
    upTo: Date,
  ): Promise<SettlementEntity | null> {
    if (await this.settlements.existsForPeriod(beneficiaryTenantId, periodStart, periodEnd)) {
      throw new ConflictError(`A settlement for tenant ${beneficiaryTenantId} already exists for ${periodStart}..${periodEnd}`);
    }

    return this.manager.transaction(async (tx) => {
      const ledgerTx = this.ledger.withManager(tx);
      const entries = await ledgerTx.findUnsettledForBeneficiary(beneficiaryTenantId, upTo);
      if (entries.length === 0) return null;

      const currency = entries[0]!.currency as CurrencyCode;

      // `direction` is this row's effect on the beneficiary's own balance —
      // CREDIT adds, DEBIT subtracts — so the net is the signed sum.
      //
      // For a SUPPLIER or PLATFORM beneficiary this is always positive: the
      // reseller collected the customer's payment directly (via their own
      // gateway account, opened in their own tenant context at checkout), so
      // supplier/platform are owed money and this settlement is a payout to
      // them. For a RESELLER beneficiary it is the reverse and typically
      // negative — they already hold the gross, and this settlement's
      // `net_payable_minor` is what *they* owe the platform's pool, not what
      // they're owed. `markPaid`'s `payout_reference` doubles as the
      // collection reference in that case; the sign is the only signal, by
      // deliberate design rather than a schema change.
      const sums = entries.reduce(
        (acc, e) => {
          const signed = e.direction === 'CREDIT' ? 1n : -1n;
          return {
            commission: acc.commission + signed * BigInt(e.commissionMinor),
            platformFee: acc.platformFee + signed * BigInt(e.platformFeeMinor),
            tax: acc.tax + signed * BigInt(e.taxMinor),
            net: acc.net + signed * BigInt(e.netMinor),
          };
        },
        { commission: 0n, platformFee: 0n, tax: 0n, net: 0n },
      );

      // Gross is informational (the merchandise value behind this payout).
      // Every row from one sale line shares the same `gross_minor` regardless
      // of direction, so it is summed only from the CREDIT side — summing
      // both directions would double it against itself for no reason.
      const grossMinor = entries
        .filter((e) => e.direction === 'CREDIT')
        .reduce((sum, e) => sum + BigInt(e.grossMinor), 0n);

      const settlementNumber = `STL-${periodEnd.replace(/-/g, '')}-${beneficiaryTenantId}`;

      const settlement = await runAsTenant(this.context, beneficiaryTenantId, async () => {
        const repo = this.settlements.withManager(tx);
        return repo.insert({
          beneficiaryTenantId,
          settlementNumber,
          periodStart,
          periodEnd,
          status: 'PENDING_APPROVAL',
          grossMinor: grossMinor.toString(),
          commissionMinor: sums.commission.toString(),
          platformFeeMinor: sums.platformFee.toString(),
          taxMinor: sums.tax.toString(),
          adjustmentMinor: '0',
          netPayableMinor: sums.net.toString(),
          currency,
          entryCount: entries.length,
        });
      });

      await ledgerTx.markSettled(
        entries.map((e) => e.id),
        settlement.id,
      );

      this.logger.log(
        `Settlement ${settlementNumber} created for tenant ${beneficiaryTenantId}: ` +
          `${Money.fromMinor(sums.net, currency).toString()} across ${entries.length} entries`,
      );

      return settlement;
    });
  }

  async approve(settlementId: string, approvedByUserId: string | null): Promise<SettlementEntity> {
    const settlement = await this.mustFindGlobal(settlementId);
    if (settlement.status !== 'PENDING_APPROVAL') {
      throw new BusinessRuleError(`Cannot approve a settlement in status ${settlement.status}`);
    }
    settlement.status = 'APPROVED';
    settlement.approvedBy = approvedByUserId;
    return this.saveGlobal(settlement);
  }

  async markProcessing(settlementId: string): Promise<SettlementEntity> {
    const settlement = await this.mustFindGlobal(settlementId);
    if (settlement.status !== 'APPROVED') {
      throw new BusinessRuleError(`Cannot process a settlement in status ${settlement.status}`);
    }
    settlement.status = 'PROCESSING';
    return this.saveGlobal(settlement);
  }

  async markPaid(settlementId: string, payoutMethod: 'BANK_TRANSFER' | 'GATEWAY_PAYOUT', payoutReference: string): Promise<SettlementEntity> {
    const settlement = await this.mustFindGlobal(settlementId);
    if (settlement.status !== 'PROCESSING' && settlement.status !== 'APPROVED') {
      throw new BusinessRuleError(`Cannot mark a settlement in status ${settlement.status} as paid`);
    }
    settlement.status = 'PAID';
    settlement.payoutMethod = payoutMethod;
    settlement.payoutReference = payoutReference;
    settlement.paidAt = new Date();
    return this.saveGlobal(settlement);
  }

  async markFailed(settlementId: string, reason: string): Promise<SettlementEntity> {
    const settlement = await this.mustFindGlobal(settlementId);
    settlement.status = 'FAILED';
    // No dedicated failure-reason column — `payoutReference` is unused on a
    // failed settlement, so it doubles as the operator-visible reason.
    settlement.payoutReference = reason.slice(0, 191);
    return this.saveGlobal(settlement);
  }

  async pendingApprovalQueue(): Promise<SettlementEntity[]> {
    return this.settlements.findAllByStatus('PENDING_APPROVAL');
  }

  /** Platform admin — any settlement, by its public id. */
  async exportCsvGlobal(publicId: string): Promise<string> {
    return this.buildCsv(await this.mustFindGlobal(publicId));
  }

  /** Tenant-facing — only a settlement belonging to the caller's own tenant. */
  async exportCsvForCurrentTenant(publicId: string): Promise<string> {
    return this.buildCsv(await this.getForCurrentTenant(publicId));
  }

  /** CSV export — no PDF renderer is available without a new dependency (see docs/05 Phase 9's "PDF/CSV report"). */
  private async buildCsv(settlement: SettlementEntity): Promise<string> {
    const entries = await this.ledger.findBySettlement(settlement.id);

    const header = [
      'entry_id',
      'created_at',
      'entry_type',
      'direction',
      'beneficiary_type',
      'order_id',
      'gross_minor',
      'commission_minor',
      'platform_fee_minor',
      'tax_minor',
      'net_minor',
      'currency',
    ];

    const rows = entries.map((e) =>
      [
        e.publicId,
        e.createdAt.toISOString(),
        e.entryType,
        e.direction,
        e.beneficiaryType,
        e.orderId,
        e.grossMinor,
        e.commissionMinor,
        e.platformFeeMinor,
        e.taxMinor,
        e.netMinor,
        e.currency,
      ].join(','),
    );

    const summary = [
      `# Settlement ${settlement.settlementNumber}`,
      `# Period: ${settlement.periodStart} to ${settlement.periodEnd}`,
      `# Net payable: ${Money.fromMinor(settlement.netPayableMinor, settlement.currency as CurrencyCode).toString()}`,
      `# Status: ${settlement.status}`,
    ];

    return [...summary, '', header.join(','), ...rows].join('\n');
  }

  // ---------------------------------------------------------------------
  // Tenant-facing (a supplier/reseller viewing their own statements)
  // ---------------------------------------------------------------------

  async listForCurrentTenant(): Promise<SettlementEntity[]> {
    return this.settlements.find({ order: { createdAt: 'DESC' } });
  }

  async getForCurrentTenant(publicId: string): Promise<SettlementEntity> {
    return this.settlements.findByPublicIdOrFail(publicId);
  }

  async toResponse(settlement: SettlementEntity): Promise<SettlementResponse> {
    const beneficiary = await this.settlements.tenantPublicInfo(settlement.beneficiaryTenantId);
    return {
      id: settlement.publicId,
      beneficiaryTenantId: beneficiary?.publicId ?? settlement.beneficiaryTenantId,
      beneficiaryBusinessName: beneficiary?.businessName ?? 'Unknown',
      settlementNumber: settlement.settlementNumber,
      periodStart: settlement.periodStart,
      periodEnd: settlement.periodEnd,
      status: settlement.status,
      grossMinor: settlement.grossMinor,
      commissionMinor: settlement.commissionMinor,
      platformFeeMinor: settlement.platformFeeMinor,
      taxMinor: settlement.taxMinor,
      adjustmentMinor: settlement.adjustmentMinor,
      netPayableMinor: settlement.netPayableMinor,
      currency: settlement.currency,
      entryCount: settlement.entryCount,
      payoutMethod: settlement.payoutMethod,
      payoutReference: settlement.payoutReference,
      paidAt: settlement.paidAt?.toISOString() ?? null,
      approvedBy: settlement.approvedBy,
      createdAt: settlement.createdAt.toISOString(),
    };
  }

  private async mustFindGlobal(publicId: string): Promise<SettlementEntity> {
    const settlement = await this.settlements.findByPublicIdGlobal(publicId);
    if (!settlement) throw new NotFoundError('Settlement', publicId);
    return settlement;
  }

  /**
   * A plain save, deliberately not wrapped in `runAsTenant`: these status
   * transitions run from a platform-admin (tenant-less) context, and
   * `TenantGuardSubscriber.beforeUpdate` only enforces ownership when the
   * active context *has* a tenant — unlike `create()`, `save()` on an
   * already-loaded entity never needs context to impersonate one.
   */
  private async saveGlobal(settlement: SettlementEntity): Promise<SettlementEntity> {
    return (await this.settlements.save(settlement)) as SettlementEntity;
  }
}
