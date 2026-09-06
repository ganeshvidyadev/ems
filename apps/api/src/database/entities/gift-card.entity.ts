import { Column, Entity } from 'typeorm';
import { BaseEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const GIFT_CARD_STATUSES = ['ACTIVE', 'DEPLETED', 'EXPIRED', 'DISABLED'] as const;
export type GiftCardStatus = (typeof GIFT_CARD_STATUSES)[number];

/**
 * A gift card code IS money, so only its hash is ever stored — `codeHash` is the
 * lookup key, `codeLast4` is display-only ("ending in 4821"). The raw code
 * exists solely in the fulfilment email/PDF, never in this table.
 */
@Entity('gift_cards')
@TenantScoped()
export class GiftCardEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'code_hash', type: 'char', length: 64 })
  codeHash!: string;

  @Column({ name: 'code_last4', type: 'char', length: 4 })
  codeLast4!: string;

  @Column({ name: 'initial_value_minor', type: 'bigint' })
  initialValueMinor!: string;

  @Column({ name: 'balance_minor', type: 'bigint' })
  balanceMinor!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: GiftCardStatus;

  @Column({ name: 'issued_to_customer_id', type: 'bigint', unsigned: true, nullable: true })
  issuedToCustomerId!: string | null;

  @Column({ name: 'issued_to_email', type: 'varchar', length: 255, nullable: true })
  issuedToEmail!: string | null;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true, nullable: true })
  orderId!: string | null;

  @Column({ name: 'expires_at', ...DATETIME3, nullable: true })
  expiresAt!: Date | null;

  get isRedeemable(): boolean {
    return (
      this.status === 'ACTIVE' &&
      this.balanceMinor !== '0' &&
      (this.expiresAt === null || this.expiresAt.getTime() > Date.now())
    );
  }
}
