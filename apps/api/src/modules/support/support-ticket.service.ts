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
    const tenantId = this.context.tenantId;
    const requesterUserId = this.context.userId;
    const now = new Date();
    const slaDueAt = new Date(now.getTime() + SLA_HOURS[input.priority] * 60 * 60 * 1000);

    const ticket = await this.tickets.save(
      this.tickets.create({
        ticketNumber: this.tickets.generateTicketNumber(),
        tenantId,
        requesterUserId,
        subject: input.subject,
        category: input.category ?? null,
        priority: input.priority,
        status: 'OPEN',
        slaDueAt,
      }),
    );

    await this.messages.insert({ ticketId: ticket.id, authorType: 'REQUESTER', authorId: requesterUserId, body: input.body, isInternalNote: false });

    return ticket;
  }

  async get(publicId: string): Promise<SupportTicketEntity> {
    return this.tickets.findByPublicIdOrFail(publicId);
  }

  async listMessages(publicId: string, includeInternal: boolean) {
    const ticket = await this.tickets.findByPublicIdOrFail(publicId);
    return this.messages.listForTicket(ticket.id, includeInternal);
  }

  async list(status: SupportTicketStatus | undefined, mineOnly: boolean): Promise<SupportTicketEntity[]> {
    if (mineOnly) {
      const tenantId = this.context.requireTenantId('list my support tickets');
      const requesterUserId = this.context.userId;
      if (!requesterUserId) return [];
      return this.tickets.listForRequester(tenantId, requesterUserId, status);
    }
    return this.tickets.listAll(status);
  }

  async addMessage(publicId: string, input: AddSupportTicketMessageRequest): Promise<void> {
    const ticket = await this.tickets.findByPublicIdOrFail(publicId);
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

  async assign(publicId: string, assignedTo: string): Promise<SupportTicketEntity> {
    const ticket = await this.tickets.findByPublicIdOrFail(publicId);
    ticket.assignedTo = assignedTo;
    if (ticket.status === 'OPEN') ticket.status = 'IN_PROGRESS';
    return this.tickets.save(ticket);
  }

  async close(publicId: string, satisfactionRating?: number): Promise<SupportTicketEntity> {
    const ticket = await this.tickets.findByPublicIdOrFail(publicId);
    if (ticket.status === 'CLOSED') throw new BusinessRuleError('Ticket is already closed');

    const now = new Date();
    ticket.status = 'CLOSED';
    ticket.resolvedAt = ticket.resolvedAt ?? now;
    ticket.closedAt = now;
    if (satisfactionRating !== undefined) ticket.satisfactionRating = satisfactionRating;
    return this.tickets.save(ticket);
  }

  async resolve(publicId: string): Promise<SupportTicketEntity> {
    const ticket = await this.tickets.findByPublicIdOrFail(publicId);
    ticket.status = 'RESOLVED';
    ticket.resolvedAt = new Date();
    return this.tickets.save(ticket);
  }
}
