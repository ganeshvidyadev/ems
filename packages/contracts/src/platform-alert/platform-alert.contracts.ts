import { z } from 'zod';
import { listQuerySchema } from '../common/pagination.js';

export const PLATFORM_ALERT_TYPES = [
  'INFRA_DOWN',
  'QUEUE_FAILURE_SPIKE',
  'PAYMENT_FAILURE',
  'QUOTA_THRESHOLD',
  'SUPPORT_SLA_BREACH',
  'TRIAL_EXPIRING',
] as const;
export type PlatformAlertType = (typeof PLATFORM_ALERT_TYPES)[number];

export const PLATFORM_ALERT_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type PlatformAlertSeverity = (typeof PLATFORM_ALERT_SEVERITIES)[number];

export const PLATFORM_ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED'] as const;
export type PlatformAlertStatus = (typeof PLATFORM_ALERT_STATUSES)[number];

export const platformAlertResponseSchema = z.object({
  id: z.string(),
  type: z.enum(PLATFORM_ALERT_TYPES),
  tenantId: z.string().nullable(),
  tenantName: z.string().nullable(),
  severity: z.enum(PLATFORM_ALERT_SEVERITIES),
  status: z.enum(PLATFORM_ALERT_STATUSES),
  title: z.string(),
  description: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  acknowledgedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PlatformAlertResponse = z.infer<typeof platformAlertResponseSchema>;

export const platformAlertListQuerySchema = listQuerySchema.extend({
  status: z.enum(PLATFORM_ALERT_STATUSES).optional(),
  severity: z.enum(PLATFORM_ALERT_SEVERITIES).optional(),
  type: z.enum(PLATFORM_ALERT_TYPES).optional(),
  tenantId: z.string().optional(),
});
export type PlatformAlertListQuery = z.infer<typeof platformAlertListQuerySchema>;
