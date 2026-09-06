import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { GiftCardEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class GiftCardRepository extends TenantScopedRepository<GiftCardEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, GiftCardEntity, context);
  }

  async findByCodeHash(codeHash: string): Promise<GiftCardEntity | null> {
    return this.findOne({ where: { codeHash } });
  }

  /** Conditional debit — never lets balance go negative under concurrent redemption. */
  async debit(id: string, amountMinor: bigint): Promise<boolean> {
    const result = (await this.manager.query(
      `UPDATE gift_cards
          SET balance_minor = balance_minor - ?,
              status = CASE WHEN balance_minor - ? <= 0 THEN 'DEPLETED' ELSE status END
        WHERE id = ? AND tenant_id = ? AND balance_minor >= ?`,
      [amountMinor.toString(), amountMinor.toString(), id, this.tenantId, amountMinor.toString()],
    )) as { affectedRows: number };
    return result.affectedRows > 0;
  }

  async credit(id: string, amountMinor: bigint): Promise<void> {
    await this.manager.query(
      `UPDATE gift_cards
          SET balance_minor = balance_minor + ?,
              status = CASE WHEN status = 'DEPLETED' THEN 'ACTIVE' ELSE status END
        WHERE id = ? AND tenant_id = ?`,
      [amountMinor.toString(), id, this.tenantId],
    );
  }
}
