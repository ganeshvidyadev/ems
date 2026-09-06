import { z } from 'zod';
import { localeSchema, shortTextSchema } from '../common/primitives.js';
import { paginationQuerySchema } from '../common/pagination.js';

export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP'] as const;
export const NOTIFICATION_RECIPIENT_TYPES = ['USER', 'CUSTOMER', 'PLATFORM_ADMIN'] as const;
export const NOTIFICATION_STATUSES = [
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'BOUNCED',
  'SUPPRESSED',
] as const;

export const upsertNotificationTemplateRequestSchema = z.object({
  code: shortTextSchema(64),
  channel: z.enum(NOTIFICATION_CHANNELS),
  locale: localeSchema.default('en'),
  subject: z.string().trim().max(500).optional(),
  body: z.string().min(1),
  providerTemplateId: z.string().trim().max(191).optional(),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
});
export type UpsertNotificationTemplateRequest = z.infer<typeof upsertNotificationTemplateRequestSchema>;

export const notificationTemplateResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  isSystem: z.boolean(),
  code: z.string(),
  channel: z.enum(NOTIFICATION_CHANNELS),
  locale: z.string(),
  subject: z.string().nullable(),
  body: z.string(),
  providerTemplateId: z.string().nullable(),
  variables: z.array(z.string()).nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NotificationTemplateResponse = z.infer<typeof notificationTemplateResponseSchema>;

export const notificationResponseSchema = z.object({
  id: z.string(),
  recipientType: z.enum(NOTIFICATION_RECIPIENT_TYPES),
  recipientId: z.string().nullable(),
  channel: z.enum(NOTIFICATION_CHANNELS),
  templateCode: z.string().nullable(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  actionUrl: z.string().nullable(),
  status: z.enum(NOTIFICATION_STATUSES),
  isUnread: z.boolean(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
  sentAt: z.string().nullable(),
});
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().default(false),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
