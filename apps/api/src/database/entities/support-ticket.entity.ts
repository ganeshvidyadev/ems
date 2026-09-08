import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const SUPPORT_TICKET_STATUSES = [
  'OPEN',
  'PENDING_CUSTOMER',
  'IN_PROGRESS',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const SUPPORT_TICKET_CATEGORIES = ['BILLING', 'TECHNICAL', 'DOMAIN', 'PAYMENT', 'SHIPPING', 'OTHER'] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

/**
 * Tenant-owned, like any other tenant table — **not** platform-global.
 *
 * It was originally placed on the platform-global allowlist on the reasoning
 * that only `platform.support:*` permissions exist for it (no tenant-scoped
 * `support:*` was ever seeded), so "ticket management" is a platform-staff
 * surface. That reasoning conflated two different things: the *management*
 * actions (assign/resolve/close) are genuinely platform-only and stay gated
 * on `platform.support:*`, but the rows themselves have a real, populated
 * `tenant_id` and a tenant's own ticket must never be readable or writable by
 * another tenant. It was — SEC-001, a P0 found in QA Phase 6: the allowlist
 * disables all three isolation layers at once, and the compensating "explicit
 * tenantId filter" the old comment promised turned out to be a client-supplied,
 * default-off query flag rather than an enforced one.
 *
 * Platform staff still see and manage every tenant's tickets — that now goes
 * through `SupportTicketRepository`'s explicit `*AcrossTenants` methods, which
 * bypass the scoped `find`/`findOne` deliberately and visibly, the escape
 * hatch this architecture already provides elsewhere.
 */
@Entity('support_tickets')
@TenantScoped()
export class SupportTicketEntity extends BaseEntity {
  @Column({ name: 'ticket_number', type: 'varchar', length: 32 })
  ticketNumber!: string;

  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'requester_user_id', type: 'bigint', unsigned: true, nullable: true })
  requesterUserId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  category!: SupportTicketCategory | null;

  @Column({ type: 'varchar', length: 16, default: 'NORMAL' })
  priority!: SupportTicketPriority;

  @Index('idx_support_tickets_tenant')
  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status!: SupportTicketStatus;

  @Index('idx_support_tickets_assignee')
  @Column({ name: 'assigned_to', type: 'bigint', unsigned: true, nullable: true })
  assignedTo!: string | null;

  /** SLA measurement — set the moment the first agent reply lands. */
  @Column({ name: 'first_response_at', type: 'datetime', precision: 3, nullable: true })
  firstResponseAt!: Date | null;

  @Column({ name: 'resolved_at', type: 'datetime', precision: 3, nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'closed_at', type: 'datetime', precision: 3, nullable: true })
  closedAt!: Date | null;

  @Index('idx_support_tickets_sla')
  @Column({ name: 'sla_due_at', type: 'datetime', precision: 3, nullable: true })
  slaDueAt!: Date | null;

  @Column({ name: 'satisfaction_rating', type: 'tinyint', unsigned: true, nullable: true })
  satisfactionRating!: number | null;

  get isOverdue(): boolean {
    return (
      this.slaDueAt !== null &&
      this.slaDueAt.getTime() < Date.now() &&
      this.status !== 'RESOLVED' &&
      this.status !== 'CLOSED'
    );
  }

  get isOpen(): boolean {
    return this.status !== 'RESOLVED' && this.status !== 'CLOSED';
  }
}
