import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessRuleError, NotFoundError } from '@ems/kernel';
import type {
  AddSupportTicketMessageRequest,
  CreateSupportTicketRequest,
  SupportTicketPriority,
} from '@ems/contracts';
import { RequestContextService } from '../../common/services/request-context.service';
import { UserEntity, type SupportTicketEntity, type SupportTicketStatus } from '../../database/entities';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { SupportTicketRepository } from './support-ticket.repository';
import { SupportTicketMessageRepository } from './support-ticket-message.repository';

/** Time-to-first-response SLA, by priority — the clock `isOverdue` measures against.
 * Overridable via `platform.settings` (`support_sla_hours`); these are only the
 * fallback for a platform that has never set it. */
const DEFAULT_SLA_HOURS: Record<SupportTicketPriority, number> = {
  URGENT: 4,
  HIGH: 8,
  NORMAL: 24,
  LOW: 72,
};

@Injectable()
export class SupportTicketService {
  constructor(
    private readonly tickets: SupportTicketRepository,
    private readonly messages: SupportTicketMessageRepository,
    private readonly context: RequestContextService,
    private readonly settings: PlatformSettingsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateSupportTicketRequest): Promise<SupportTicketEntity> {
    const requesterUserId = this.context.userId;
    const now = new Date();
    const slaHours = await this.settings.get('support_sla_hours', DEFAULT_SLA_HOURS);
    const slaDueAt = new Date(now.getTime() + slaHours[input.priority] * 60 * 60 * 1000);

    // `create()` stamps `tenantId` from the active context itself (and throws
    // if a caller with no tenant — a platform user — tries to raise one; that
    // is a deliberate scope decision, not a regression: nothing in this
    // codebase ever exercised a platform-originated ticket).
    const ticket = await this.tickets.save(
      this.tickets.create({
        ticketNumber: this.tickets.generateTicketNumber(),
        requesterUserId,
        subject: input.subject,
        category: input.category ?? null,
        priority: input.priority,
        status: 'OPEN',
        slaDueAt,
      }),
    ) as SupportTicketEntity;

    await this.messages.insert({ ticketId: ticket.id, authorType: 'REQUESTER', authorId: requesterUserId, body: input.body, isInternalNote: false });

    return ticket;
  }

  /**
   * Platform staff reach any tenant's ticket; everyone else is confined to
   * their own tenant's, via the ordinary tenant-scoped lookup — this is the
   * fix for SEC-001, where an unscoped `findOne` let any authenticated user
   * of any tenant address any ticket by public id.
   */
  private async resolveTicket(publicId: string): Promise<SupportTicketEntity> {
    return this.context.isPlatformRequest
      ? this.tickets.findByPublicIdAcrossTenantsOrFail(publicId)
      : this.tickets.findByPublicIdOrFail(publicId);
  }

  async get(publicId: string): Promise<SupportTicketEntity> {
    return this.resolveTicket(publicId);
  }

  async listMessages(publicId: string, includeInternal: boolean) {
    const ticket = await this.resolveTicket(publicId);
    return this.messages.listForTicket(ticket.id, includeInternal);
  }

  async list(status: SupportTicketStatus | undefined, mineOnly: boolean): Promise<SupportTicketEntity[]> {
    if (this.context.isPlatformRequest) {
      return this.tickets.listAllAcrossTenants(status);
    }
    // A tenant caller is ALWAYS scoped to their own tenant, regardless of
    // `mineOnly` — the flag only narrows further, to just the caller's own
    // tickets within that tenant. `mineOnly` used to be what chose between
    // "my tenant" and "every tenant" (SEC-001); it must never make that choice.
    if (mineOnly) {
      const requesterUserId = this.context.userId;
      if (!requesterUserId) return [];
      return this.tickets.listForRequester(requesterUserId, status);
    }
    return this.tickets.listForTenant(status);
  }

  async addMessage(publicId: string, input: AddSupportTicketMessageRequest): Promise<void> {
    const ticket = await this.resolveTicket(publicId);
    const isPlatformStaff = this.context.isPlatformRequest;

    await this.messages.insert({
      ticketId: ticket.id,
      authorType: isPlatformStaff ? 'AGENT' : 'REQUESTER',
      authorId: this.context.userId,
      body: input.body,
      isInternalNote: isPlatformStaff ? input.isInternalNote : false,
    });

    if (isPlatformStaff && ticket.firstResponseAt === null && !input.isInternalNote) {
      ticket.firstResponseAt = new Date();
    }
    if (ticket.status === 'OPEN') ticket.status = 'IN_PROGRESS';
    else if (ticket.status === 'PENDING_CUSTOMER' && !isPlatformStaff) ticket.status = 'IN_PROGRESS';
    await this.tickets.save(ticket);
  }

  // assign/resolve/close are already gated on `platform.support:*` at the
  // controller, so the caller is always platform staff by the time these run.
  //
  // `assignedTo` on the wire is always a public id — the only kind of user id
  // a client ever holds (see `UserSummary.id`) — but `SupportTicketEntity.assignedTo`
  // is the internal bigint foreign key, like every other user reference on this
  // entity (`requesterUserId`, `authorId`). Resolving here, rather than trusting
  // the caller's string straight into that column, is what the earlier version
  // of this method skipped: MySQL rejected the 26-character public id with
  // "Data truncated for column 'assigned_to'" the first time this shipped a UI.
  async assign(publicId: string, assignedToPublicId: string): Promise<SupportTicketEntity> {
    const ticket = await this.tickets.findByPublicIdAcrossTenantsOrFail(publicId);
    const assignee = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { publicId: assignedToPublicId } });
    if (!assignee) throw new NotFoundError('User', assignedToPublicId);

    ticket.assignedTo = assignee.id;
    if (ticket.status === 'OPEN') ticket.status = 'IN_PROGRESS';
    return this.tickets.save(ticket) as Promise<SupportTicketEntity>;
  }

  async close(publicId: string, satisfactionRating?: number): Promise<SupportTicketEntity> {
    const ticket = await this.tickets.findByPublicIdAcrossTenantsOrFail(publicId);
    if (ticket.status === 'CLOSED') throw new BusinessRuleError('Ticket is already closed');

    const now = new Date();
    ticket.status = 'CLOSED';
    ticket.resolvedAt = ticket.resolvedAt ?? now;
    ticket.closedAt = now;
    if (satisfactionRating !== undefined) ticket.satisfactionRating = satisfactionRating;
    return this.tickets.save(ticket) as Promise<SupportTicketEntity>;
  }

  async resolve(publicId: string): Promise<SupportTicketEntity> {
    const ticket = await this.tickets.findByPublicIdAcrossTenantsOrFail(publicId);
    ticket.status = 'RESOLVED';
    ticket.resolvedAt = new Date();
    return this.tickets.save(ticket) as Promise<SupportTicketEntity>;
  }
}
