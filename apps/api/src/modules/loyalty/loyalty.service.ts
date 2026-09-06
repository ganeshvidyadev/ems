import { Injectable } from '@nestjs/common';
import type { LoyaltyTransactionResponse } from '@ems/contracts';
import { BusinessRuleError } from '@ems/kernel';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';
import type { LoyaltyTransactionEntity, LoyaltyTransactionType } from '../../database/entities';
import { CustomerRepository } from '../customer/customer.repository';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';
import { LoyaltyTransactionRepository } from './loyalty.repository';

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly transactions: LoyaltyTransactionRepository,
    private readonly customers: CustomerRepository,
    private readonly context: RequestContextService,
  ) {}

  async balance(customerId: string): Promise<number> {
    const customer = await this.customers.findOneOrFail({ where: { id: customerId } as never });
    return customer.loyaltyPoints;
  }

  async history(customerPublicId: string, page: number, limit: number): Promise<{
    items: LoyaltyTransactionResponse[];
    total: number;
  }> {
    const customer = await this.customers.findByPublicIdOrFail(customerPublicId);
    const { items, total } = await this.transactions.listByCustomer(customer.id, page, limit);
    return { items: items.map((t) => this.toResponse(t)), total };
  }

  /** Manual admin adjustment (goodwill credit, correction) — its own top-level transaction. */
  async adjust(customerPublicId: string, pointsDelta: number, description?: string): Promise<void> {
    await this.manager.transaction(async (tx) => {
      const customer = await this.customers.withManager(tx).findByPublicIdOrFail(customerPublicId);
      await this.appendLedger(tx, customer.id, 'ADJUST', pointsDelta, null, description ?? null);
    });
  }

  /** Awards points for a completed order. Called inside the order-confirmation transaction. */
  async earn(
    manager: EntityManager,
    customerId: string,
    points: number,
    orderId: string,
    description = 'Order reward points',
  ): Promise<void> {
    if (points <= 0) return;
    await this.appendLedger(manager, customerId, 'EARN', points, orderId, description);
  }

  /** Redeems points at checkout. Throws if the customer's balance can't cover it. */
  async redeemAtCheckout(
    manager: EntityManager,
    customerId: string,
    points: number,
    orderId: string,
  ): Promise<void> {
    if (points <= 0) return;
    const customer = await this.customers.withManager(manager).findOneOrFail({ where: { id: customerId } as never });
    if (customer.loyaltyPoints < points) {
      throw new BusinessRuleError('Insufficient loyalty point balance');
    }
    await this.appendLedger(manager, customerId, 'REDEEM', -points, orderId, 'Redeemed at checkout');
  }

  /** Reverses a redemption or an award — order cancelled before it settled. */
  async reverse(manager: EntityManager, customerId: string, orderId: string): Promise<void> {
    const scoped = this.transactions.withManager(manager);
    const rows = await scoped.find({ where: { customerId, orderId } });
    for (const row of rows) {
      await this.appendLedger(manager, customerId, 'REVERSAL', -row.pointsDelta, orderId, `Reversal of ${row.type}`);
    }
  }

  private async appendLedger(
    manager: EntityManager,
    customerId: string,
    type: LoyaltyTransactionType,
    pointsDelta: number,
    orderId: string | null,
    description: string | null,
  ): Promise<void> {
    const scopedCustomers = this.customers.withManager(manager);
    const scopedTransactions = this.transactions.withManager(manager);

    const customer = await scopedCustomers.findOneOrFail({ where: { id: customerId } as never });
    const pointsAfter = customer.loyaltyPoints + pointsDelta;

    await scopedTransactions.insert({
      customerId,
      type,
      pointsDelta,
      pointsAfter,
      orderId,
      description,
      createdBy: this.context.userId,
    });

    await scopedCustomers.update({ id: customerId } as never, { loyaltyPoints: pointsAfter } as never);
  }

  toResponse(transaction: LoyaltyTransactionEntity): LoyaltyTransactionResponse {
    return {
      id: transaction.id,
      type: transaction.type,
      pointsDelta: transaction.pointsDelta,
      pointsAfter: transaction.pointsAfter,
      orderId: transaction.orderId,
      description: transaction.description,
      createdAt: transaction.createdAt.toISOString(),
    };
  }
}

export type { PaginatedResult };
