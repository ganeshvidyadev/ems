import { Injectable } from '@nestjs/common';
import type { GiftCardResponse, IssueGiftCardRequest, IssueGiftCardResponse } from '@ems/contracts';
import { Money, NotFoundError, type CurrencyCode } from '@ems/kernel';
import type { EntityManager } from 'typeorm';
import type { GiftCardEntity } from '../../database/entities';
import { CryptoService } from '../../common/services/crypto.service';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';
import { GiftCardRepository } from './gift-card.repository';

@Injectable()
export class GiftCardService {
  constructor(
    private readonly giftCards: GiftCardRepository,
    private readonly crypto: CryptoService,
  ) {}

  async list(page: number, limit: number): Promise<PaginatedResult<GiftCardEntity>> {
    return this.giftCards.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async issue(input: IssueGiftCardRequest): Promise<IssueGiftCardResponse> {
    const code = this.generateCode();
    const codeHash = this.crypto.hashToken(code);

    const card = await this.giftCards.insert({
      codeHash,
      codeLast4: code.slice(-4),
      initialValueMinor: input.amountMinor,
      balanceMinor: input.amountMinor,
      currency: input.currency,
      status: 'ACTIVE',
      issuedToCustomerId: input.issuedToCustomerId ?? null,
      issuedToEmail: input.issuedToEmail ?? null,
      orderId: null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });

    return {
      id: card.publicId,
      code,
      balance: Money.fromMinor(card.balanceMinor, card.currency as CurrencyCode).toJSON(),
      status: card.status,
      expiresAt: card.expiresAt?.toISOString() ?? null,
    };
  }

  /** Looks a card up by its raw code — used at checkout and by the balance-check endpoint. */
  async findByCode(code: string): Promise<GiftCardEntity | null> {
    return this.giftCards.findByCodeHash(this.crypto.hashToken(code.trim().toUpperCase()));
  }

  async checkBalance(code: string): Promise<{ valid: boolean; balance?: Money }> {
    const card = await this.findByCode(code);
    if (!card || !card.isRedeemable) return { valid: false };
    return { valid: true, balance: Money.fromMinor(card.balanceMinor, card.currency as CurrencyCode) };
  }

  /** Debits up to `requested`, returning what was actually applied — checkout only. */
  async redeem(manager: EntityManager, card: GiftCardEntity, requested: Money): Promise<Money> {
    const applied = requested.greaterThan(Money.fromMinor(card.balanceMinor, card.currency as CurrencyCode))
      ? Money.fromMinor(card.balanceMinor, card.currency as CurrencyCode)
      : requested;

    if (applied.isZero) return applied;

    const debited = await this.giftCards.withManager(manager).debit(card.id, applied.amountMinor);
    if (!debited) {
      throw new NotFoundError('GiftCard balance', card.id);
    }
    return applied;
  }

  /** Credits back a gift-card redemption — order cancelled/refunded before fulfilment. */
  async reverse(manager: EntityManager, cardId: string, amount: Money): Promise<void> {
    if (amount.isZero) return;
    await this.giftCards.withManager(manager).credit(cardId, amount.amountMinor);
  }

  private generateCode(): string {
    // Human-typeable: uppercase base32-ish alphabet, grouped for readability.
    const raw = this.crypto.generateToken(15).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
    const padded = raw.padEnd(12, '0');
    return `${padded.slice(0, 4)}-${padded.slice(4, 8)}-${padded.slice(8, 12)}`;
  }

  toResponse(card: GiftCardEntity): GiftCardResponse {
    return {
      id: card.publicId,
      codeLast4: card.codeLast4,
      initialValue: Money.fromMinor(card.initialValueMinor, card.currency as CurrencyCode).toJSON(),
      balance: Money.fromMinor(card.balanceMinor, card.currency as CurrencyCode).toJSON(),
      status: card.status,
      issuedToEmail: card.issuedToEmail,
      expiresAt: card.expiresAt?.toISOString() ?? null,
      createdAt: card.createdAt.toISOString(),
    };
  }
}
