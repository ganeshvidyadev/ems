import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { IsNull, Not, type EntityManager, type Repository } from 'typeorm';
import { CommissionLedgerEntity } from '../../database/entities';

/**
 * Plain, append-only repository — see `CommissionLedgerEntity`'s own doc
 * comment for why this isn't `TenantScopedRepository`. There is
 * deliberately no `update`/`delete` method: every write is an `insert`,
 * a reversal included.
 */
@Injectable()
export class CommissionLedgerRepository {
  private readonly repository: Repository<CommissionLedgerEntity>;

  constructor(@InjectEntityManager() private readonly manager: EntityManager) {
    this.repository = manager.getRepository(CommissionLedgerEntity);
  }

  /** Bound to a transaction manager — every write from `MarketplaceOrderService` goes through this. */
  withManager(manager: EntityManager): CommissionLedgerRepository {
    const scoped = Object.create(this) as CommissionLedgerRepository;
    Object.defineProperty(scoped, 'manager', { value: manager });
    Object.defineProperty(scoped, 'repository', { value: manager.getRepository(CommissionLedgerEntity) });
    return scoped;
  }

  async insertMany(entries: Partial<CommissionLedgerEntity>[]): Promise<CommissionLedgerEntity[]> {
    const rows = entries.map((entry) => this.repository.create(entry));
    return this.repository.save(rows);
  }

  async findByOrder(orderId: string): Promise<CommissionLedgerEntity[]> {
    return this.repository.find({ where: { orderId }, order: { createdAt: 'ASC' } });
  }

  async findForBeneficiary(
    beneficiaryTenantId: string,
    options: { settled?: boolean } = {},
  ): Promise<CommissionLedgerEntity[]> {
    return this.repository.find({
      where:
        options.settled === undefined
          ? { beneficiaryTenantId }
          : { beneficiaryTenantId, settlementId: options.settled ? Not(IsNull()) : IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  /** Every unsettled entry for one beneficiary — a settlement run's own line items. */
  async findUnsettledForBeneficiary(beneficiaryTenantId: string, upTo: Date): Promise<CommissionLedgerEntity[]> {
    return this.repository
      .createQueryBuilder('l')
      .where('l.beneficiaryTenantId = :beneficiaryTenantId', { beneficiaryTenantId })
      .andWhere('l.settlementId IS NULL')
      .andWhere('l.createdAt <= :upTo', { upTo })
      .orderBy('l.createdAt', 'ASC')
      .getMany();
  }

  /** Distinct beneficiaries with at least one unsettled entry as of `upTo` — the settlement batch's own worklist. */
  async findBeneficiariesWithUnsettledEntries(upTo: Date): Promise<string[]> {
    const rows = (await this.manager.query(
      `SELECT DISTINCT beneficiary_tenant_id AS beneficiaryTenantId
         FROM commission_ledger
        WHERE settlement_id IS NULL AND beneficiary_tenant_id IS NOT NULL AND created_at <= ?`,
      [upTo],
    )) as { beneficiaryTenantId: string }[];
    return rows.map((r) => r.beneficiaryTenantId);
  }

  async markSettled(entryIds: string[], settlementId: string): Promise<void> {
    if (entryIds.length === 0) return;
    await this.repository
      .createQueryBuilder()
      .update()
      .set({ settlementId })
      .whereInIds(entryIds)
      .execute();
  }

  async findBySettlement(settlementId: string): Promise<CommissionLedgerEntity[]> {
    return this.repository.find({ where: { settlementId }, order: { createdAt: 'ASC' } });
  }
}
