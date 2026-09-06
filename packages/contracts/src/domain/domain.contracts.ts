import { z } from 'zod';
import { domainResponseSchema } from '../tenant/tenant.contracts.js';

/**
 * `DOMAIN_TYPES`, `SSL_STATUSES`, `addDomainRequestSchema` and
 * `domainResponseSchema` already exist in `tenant.contracts.ts` — seeded
 * ahead of this phase alongside the provisioning saga's own domain step.
 * This file adds only what that one didn't need yet: DNS instruction copy
 * and per-step diagnostics for the custom-domain verification flow.
 */

export const dnsRecordInstructionSchema = z.object({
  type: z.enum(['TXT', 'CNAME']),
  name: z.string(),
  value: z.string(),
  purpose: z.string(),
});
export type DnsRecordInstruction = z.infer<typeof dnsRecordInstructionSchema>;

export const domainVerificationInstructionsResponseSchema = z.object({
  domain: domainResponseSchema,
  records: z.array(dnsRecordInstructionSchema),
});
export type DomainVerificationInstructionsResponse = z.infer<typeof domainVerificationInstructionsResponseSchema>;

export const domainDiagnosticStepSchema = z.object({
  step: z.string(),
  status: z.enum(['PENDING', 'PASSED', 'FAILED']),
  detail: z.string().nullable(),
});
export type DomainDiagnosticStep = z.infer<typeof domainDiagnosticStepSchema>;

export const domainDiagnosticsResponseSchema = z.object({
  domain: domainResponseSchema,
  steps: z.array(domainDiagnosticStepSchema),
});
export type DomainDiagnosticsResponse = z.infer<typeof domainDiagnosticsResponseSchema>;
