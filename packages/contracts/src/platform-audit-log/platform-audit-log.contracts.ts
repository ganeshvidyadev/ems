import { z } from 'zod';
import { listQuerySchema } from '../common/pagination.js';
import { publicIdSchema } from '../common/primitives.js';

export const AUDIT_ACTOR_TYPES = ['USER', 'CUSTOMER', 'SYSTEM', 'PLATFORM_ADMIN', 'API_KEY'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export const platformAuditLogListQuerySchema = listQuerySchema.extend({
  severity: z.enum(AUDIT_SEVERITIES).optional(),
  actorType: z.enum(AUDIT_ACTOR_TYPES).optional(),
  entityType: z.string().optional(),
  /** Narrows the cross-tenant trail to one tenant (Tenant 360). */
  tenantId: publicIdSchema.optional(),
  /** `YYYY-MM-DD` — the partitioned table's own natural filter granularity. */
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PlatformAuditLogListQuery = z.infer<typeof platformAuditLogListQuerySchema>;

export const platformAuditLogResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  actorType: z.enum(AUDIT_ACTOR_TYPES),
  actorId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  beforeState: z.record(z.unknown()).nullable(),
  afterState: z.record(z.unknown()).nullable(),
  changedFields: z.array(z.string()).nullable(),
  severity: z.enum(AUDIT_SEVERITIES),
  correlationId: z.string().nullable(),
  createdAt: z.string(),
});
export type PlatformAuditLogResponse = z.infer<typeof platformAuditLogResponseSchema>;
