import { Column, Entity, Index } from 'typeorm';
import { NumericIdEntity, DATETIME3 } from './base.entity';

export const SUPPORT_TICKET_MESSAGE_AUTHOR_TYPES = ['REQUESTER', 'AGENT', 'SYSTEM'] as const;
export type SupportTicketMessageAuthorType = (typeof SUPPORT_TICKET_MESSAGE_AUTHOR_TYPES)[number];

/**
 * No `tenant_id` of its own — isolation is transitive through `ticket_id`
 * (`support_tickets` is itself platform-global; see that entity's doc
 * comment), the same shape `UserRoleEntity` uses for a join table with no
 * discriminator column.
 */
@Entity('support_ticket_messages')
export class SupportTicketMessageEntity extends NumericIdEntity {
  @Index('idx_ticket_messages_ticket')
  @Column({ name: 'ticket_id', type: 'bigint', unsigned: true })
  ticketId!: string;

  @Column({ name: 'author_type', type: 'varchar', length: 32 })
  authorType!: SupportTicketMessageAuthorType;

  @Column({ name: 'author_id', type: 'bigint', unsigned: true, nullable: true })
  authorId!: string | null;

  @Column({ type: 'mediumtext' })
  body!: string;

  /** File keys/URLs the requester or agent attached — display-only, no upload pipeline of its own this phase. */
  @Column({ type: 'json', nullable: true })
  attachments!: string[] | null;

  @Column({ name: 'is_internal_note', type: 'tinyint', width: 1, default: 0 })
  isInternalNote!: boolean;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;
}
