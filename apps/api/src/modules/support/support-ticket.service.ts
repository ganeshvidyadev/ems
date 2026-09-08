import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '@ems/kernel';
import type {
  AddSupportTicketMessageRequest,
  CreateSupportTicketRequest,
  SupportTicketPriority,
} from '@ems/contracts';
import { RequestContextService } from '../../common/services/request-context.service';
import type { SupportTicketEntity, SupportTicketStatus } from '../../database/entities';
import { SupportTicketRepository } from './support-ticket.repository';
import { SupportTicketMessageRepository } from './support-ticket-message.repository';

/** Time-to-first-response SLA, by priority — the clock `isOverdue` measures against. */
const SLA_HOURS: Record<SupportTicketPriority, number> = {
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
  ) {}

  async create(input: CreateSupportTicketRequest): Promise<SupportTicketEntity> {
    const requesterUserId = this.context.userId;
    const now = new Date();
    const slaDueAt = new Date(now.getTime() + SLA_HOURS[input.priority] * 60 * 60 * 1000);

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
  async assign(publicId: string, assignedTo: string): Promise<SupportTicketEntity> {
    const ticket = await this.tickets.findByPublicIdAcrossTenantsOrFail(publicId);
    ticket.assignedTo = assignedTo;
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
