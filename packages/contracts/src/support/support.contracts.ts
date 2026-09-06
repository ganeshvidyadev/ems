import { z } from 'zod';
import { shortTextSchema } from '../common/primitives.js';

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

export const createSupportTicketRequestSchema = z.object({
  subject: shortTextSchema(255),
  body: z.string().trim().min(1).max(20_000),
  category: z.enum(SUPPORT_TICKET_CATEGORIES).optional(),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).default('NORMAL'),
});
export type CreateSupportTicketRequest = z.infer<typeof createSupportTicketRequestSchema>;

export const addSupportTicketMessageRequestSchema = z.object({
  body: z.string().trim().min(1).max(20_000),
  isInternalNote: z.boolean().default(false),
});
export type AddSupportTicketMessageRequest = z.infer<typeof addSupportTicketMessageRequestSchema>;

export const assignSupportTicketRequestSchema = z.object({
  assignedTo: z.string(),
});
export type AssignSupportTicketRequest = z.infer<typeof assignSupportTicketRequestSchema>;

export const closeSupportTicketRequestSchema = z.object({
  satisfactionRating: z.number().int().min(1).max(5).optional(),
});
export type CloseSupportTicketRequest = z.infer<typeof closeSupportTicketRequestSchema>;

export const supportTicketMessageResponseSchema = z.object({
  id: z.string(),
  authorType: z.enum(['REQUESTER', 'AGENT', 'SYSTEM']),
  authorId: z.string().nullable(),
  body: z.string(),
  isInternalNote: z.boolean(),
  createdAt: z.string(),
});
export type SupportTicketMessageResponse = z.infer<typeof supportTicketMessageResponseSchema>;

export const supportTicketResponseSchema = z.object({
  id: z.string(),
  ticketNumber: z.string(),
  tenantId: z.string().nullable(),
  requesterUserId: z.string().nullable(),
  subject: z.string(),
  category: z.enum(SUPPORT_TICKET_CATEGORIES).nullable(),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES),
  status: z.enum(SUPPORT_TICKET_STATUSES),
  assignedTo: z.string().nullable(),
  slaDueAt: z.string().nullable(),
  isOverdue: z.boolean(),
  satisfactionRating: z.number().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
});
export type SupportTicketResponse = z.infer<typeof supportTicketResponseSchema>;

export const listSupportTicketsQuerySchema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
  mineOnly: z.coerce.boolean().default(false),
});
export type ListSupportTicketsQuery = z.infer<typeof listSupportTicketsQuerySchema>;
