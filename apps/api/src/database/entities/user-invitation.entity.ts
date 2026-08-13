import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity, DATETIME3 } from './base.entity';
import { TenantEntity } from './tenant.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * Staff invitation.
 *
 * Separate from `auth_tokens` because the invariant differs: the invitee has no
 * account yet, so there is no `user_id` to bind to. The row therefore has to carry
 * everything needed to *create* the account on acceptance — email, tenant, intended
 * roles, and optional per-store scoping.
 */
@Entity('user_invitations')
@TenantScoped()
export class UserInvitationEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'email_normalized', type: 'varchar', length: 255 })
  emailNormalized!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  @Index('uq_user_invitations_token', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  /**
   * Role ids granted on acceptance.
   *
   * Snapshotted as ids rather than resolved at acceptance time so a role deleted
   * between invite and acceptance cannot silently escalate or drop the grant — the
   * acceptance path re-validates each id still exists and belongs to this tenant.
   */
  @Column({ name: 'role_ids', type: 'json' })
  roleIds!: number[];

  /** NULL ⇒ the grant applies across every store of the tenant. */
  @Column({ name: 'store_id', type: 'bigint', unsigned: true, nullable: true })
  storeId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: InvitationStatus;

  @Column({ name: 'invited_by', type: 'bigint', unsigned: true, nullable: true })
  invitedBy!: string | null;

  @Column({ name: 'accepted_user_id', type: 'bigint', unsigned: true, nullable: true })
  acceptedUserId!: string | null;

  @Column({ name: 'expires_at', ...DATETIME3 })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', ...DATETIME3, nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'revoked_at', ...DATETIME3, nullable: true })
  revokedAt!: Date | null;

  /** Throttles resends — an invite endpoint is otherwise an email-spam relay. */
  @Column({ name: 'resent_count', type: 'smallint', unsigned: true, default: 0 })
  resentCount!: number;

  @Column({ name: 'last_sent_at', ...DATETIME3, nullable: true })
  lastSentAt!: Date | null;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  get isAcceptable(): boolean {
    return (
      this.status === 'PENDING' &&
      this.revokedAt === null &&
      this.expiresAt.getTime() > Date.now()
    );
  }
}
