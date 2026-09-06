import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addSupportTicketMessageRequestSchema,
  assignSupportTicketRequestSchema,
  closeSupportTicketRequestSchema,
  createSupportTicketRequestSchema,
  listSupportTicketsQuerySchema,
  type AddSupportTicketMessageRequest,
  type AssignSupportTicketRequest,
  type CloseSupportTicketRequest,
  type CreateSupportTicketRequest,
  type SupportTicketMessageResponse,
  type SupportTicketResponse,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { SupportTicketEntity, SupportTicketMessageEntity } from '../../database/entities';
import { SupportTicketService } from './support-ticket.service';

/**
 * `console/support-tickets` doubles as the tenant self-service surface
 * (create, list-mine, reply) and, for platform staff, the management surface
 * (list-all, assign, close) — gated by `platform.support:*` only where the
 * action genuinely is platform-only, matching the seed's own split (no
 * tenant-scoped `support:*` permission exists — see `SupportTicketEntity`'s
 * doc comment). Create/reply/list-mine need no special permission beyond
 * being an authenticated tenant user, the same as viewing one's own orders.
 */
@ApiTags('support')
@Controller({ version: '1' })
export class SupportTicketController {
  constructor(private readonly tickets: SupportTicketService) {}

  @Post('console/support-tickets')
  @ApiOperation({ summary: 'Raise a support ticket as the signed-in tenant user' })
  async create(@Body(new ZodValidationPipe(createSupportTicketRequestSchema)) body: CreateSupportTicketRequest): Promise<SupportTicketResponse> {
    return toResponse(await this.tickets.create(body));
  }

  @Get('console/support-tickets')
  @ApiOperation({ summary: "List tickets — platform staff see every tenant's; others see only their own" })
  async list(
    @Query(new ZodValidationPipe(listSupportTicketsQuerySchema)) query: ReturnType<typeof listSupportTicketsQuerySchema.parse>,
  ): Promise<SupportTicketResponse[]> {
    const tickets = await this.tickets.list(query.status, query.mineOnly);
    return tickets.map(toResponse);
  }

  @Get('console/support-tickets/:id')
  @ApiOperation({ summary: 'Get one ticket' })
  async get(@Param('id') id: string): Promise<SupportTicketResponse> {
    return toResponse(await this.tickets.get(id));
  }

  @Get('console/support-tickets/:id/messages')
  @ApiOperation({ summary: 'Thread for one ticket — internal notes only shown to platform staff' })
  async listMessages(@Param('id') id: string): Promise<SupportTicketMessageResponse[]> {
    const messages = await this.tickets.listMessages(id, true);
    return messages.map(toMessageResponse);
  }

  @Post('console/support-tickets/:id/messages')
  @ApiOperation({ summary: 'Reply on a ticket (or, for platform staff, add an internal note)' })
  async addMessage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addSupportTicketMessageRequestSchema)) body: AddSupportTicketMessageRequest,
  ): Promise<SupportTicketResponse> {
    await this.tickets.addMessage(id, body);
    return toResponse(await this.tickets.get(id));
  }

  @Post('console/support-tickets/:id/assign')
  @Permissions('platform.support:assign')
  @ApiOperation({ summary: 'Assign a ticket to a platform staff member' })
  async assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignSupportTicketRequestSchema)) body: AssignSupportTicketRequest,
  ): Promise<SupportTicketResponse> {
    return toResponse(await this.tickets.assign(id, body.assignedTo));
  }

  @Post('console/support-tickets/:id/resolve')
  @Permissions('platform.support:update')
  @ApiOperation({ summary: 'Mark a ticket resolved' })
  async resolve(@Param('id') id: string): Promise<SupportTicketResponse> {
    return toResponse(await this.tickets.resolve(id));
  }

  @Post('console/support-tickets/:id/close')
  @Permissions('platform.support:close')
  @ApiOperation({ summary: 'Close a ticket, optionally capturing a satisfaction rating' })
  async close(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeSupportTicketRequestSchema)) body: CloseSupportTicketRequest,
  ): Promise<SupportTicketResponse> {
    return toResponse(await this.tickets.close(id, body.satisfactionRating));
  }
}

function toResponse(ticket: SupportTicketEntity): SupportTicketResponse {
  return {
    id: ticket.publicId,
    ticketNumber: ticket.ticketNumber,
    tenantId: ticket.tenantId,
    requesterUserId: ticket.requesterUserId,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    assignedTo: ticket.assignedTo,
    slaDueAt: ticket.slaDueAt?.toISOString() ?? null,
    isOverdue: ticket.isOverdue,
    satisfactionRating: ticket.satisfactionRating,
    createdAt: ticket.createdAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
  };
}

function toMessageResponse(message: SupportTicketMessageEntity): SupportTicketMessageResponse {
  return {
    id: message.id,
    authorType: message.authorType,
    authorId: message.authorId,
    body: message.body,
    isInternalNote: message.isInternalNote,
    createdAt: message.createdAt.toISOString(),
  };
}
