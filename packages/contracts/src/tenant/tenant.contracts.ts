import { z } from 'zod';
import {
  countryCodeSchema,
  currencyCodeSchema,
  dnsLabelSchema,
  emailSchema,
  hostnameSchema,
  localeSchema,
  phoneSchema,
  publicIdSchema,
  timezoneSchema,
} from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const TENANT_STATUSES = [
  'PENDING',
  'PROVISIONING',
  'ACTIVE',
  'TRIAL',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
  'DELETED',
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** Cursor through the provisioning saga — drives the onboarding wizard's step display. */
export const PROVISIONING_STEPS = [
  'TENANT_CREATED',
  'STORE_CREATED',
  'SUBDOMAIN_ASSIGNED',
  'THEME_CLONED',
  'CATALOG_SEEDED',
  'STORAGE_PREPARED',
  'SSL_ISSUED',
  'SEARCH_INDEXED',
  'WELCOME_SENT',
  'COMPLETED',
] as const;
export type ProvisioningStep = (typeof PROVISIONING_STEPS)[number];

export const createTenantRequestSchema = z.object({
  businessName: z.string().trim().min(2).max(255),
  legalName: z.string().trim().max(255).optional(),
  /** Omit to derive from businessName; uniqueness is resolved server-side. */
  slug: dnsLabelSchema.optional(),
  contactEmail: emailSchema,
  contactPhone: phoneSchema.optional(),
  countryCode: countryCodeSchema.default('IN'),
  defaultCurrency: currencyCodeSchema.default('INR'),
  defaultLocale: localeSchema.default('en-IN'),
  timezone: timezoneSchema.default('Asia/Kolkata'),
  taxRegistration: z.string().trim().max(64).optional(),
  planCode: z.string().trim().min(1).max(64),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});
export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;

export const updateTenantRequestSchema = createTenantRequestSchema
  .omit({ slug: true, planCode: true, billingCycle: true })
  .partial();

export const tenantResponseSchema = z.object({
  id: publicIdSchema,
  slug: z.string(),
  businessName: z.string(),
  legalName: z.string().nullable(),
  status: z.enum(TENANT_STATUSES),
  provisioningStep: z.enum(PROVISIONING_STEPS).nullable(),
  countryCode: z.string(),
  defaultCurrency: z.string(),
  defaultLocale: z.string(),
  timezone: z.string(),
  taxRegistration: z.string().nullable(),
  contactEmail: z.string(),
  contactPhone: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  suspendedAt: z.string().nullable(),
  suspensionReason: z.string().nullable(),
  primaryDomain: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TenantResponse = z.infer<typeof tenantResponseSchema>;

export const tenantListQuerySchema = listQuerySchema.extend({
  status: z.enum(TENANT_STATUSES).optional(),
  status__in: z.string().optional(),
  planCode: z.string().optional(),
  sort: sortQuerySchema(
    ['createdAt', 'businessName', 'status', 'slug'] as const,
    [{ field: 'createdAt', direction: 'DESC' }],
  ),
});

export const suspendTenantRequestSchema = z.object({
  reason: z.string().trim().min(5).max(255),
  /** Read-only keeps the storefront live but blocks writes; full blocks everything. */
  mode: z.enum(['READ_ONLY', 'FULL']).default('READ_ONLY'),
  notifyOwner: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export const DOMAIN_TYPES = ['SUBDOMAIN', 'CUSTOM'] as const;
export const SSL_STATUSES = ['NONE', 'PENDING', 'ISSUING', 'ACTIVE', 'FAILED', 'EXPIRED'] as const;

export const addDomainRequestSchema = z.object({
  hostname: hostnameSchema,
  storeId: publicIdSchema.optional(),
  isPrimary: z.boolean().default(false),
  verificationMethod: z.enum(['DNS_TXT', 'CNAME']).default('DNS_TXT'),
});

export const domainResponseSchema = z.object({
  // Not `publicIdSchema` — `tenant_domains` has no `public_id` column (docs/02's DDL
  // never gave it one), so the internal numeric id is the only addressable key.
  id: z.string(),
  hostname: z.string(),
  type: z.enum(DOMAIN_TYPES),
  isPrimary: z.boolean(),
  verificationMethod: z.string().nullable(),
  /** Present until verified, so the UI can show the exact DNS record to create. */
  verificationToken: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  isVerified: z.boolean(),
  /** Verified AND serving HTTPS — the "safe to tell the merchant this is live" flag. */
  isLive: z.boolean(),
  sslStatus: z.enum(SSL_STATUSES),
  sslIssuedAt: z.string().nullable(),
  sslExpiresAt: z.string().nullable(),
  lastCheckAt: z.string().nullable(),
  /** Drives the exponential-backoff verification retry (docs/01 §10). */
  checkAttempts: z.number(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
});
export type DomainResponse = z.infer<typeof domainResponseSchema>;

/** Live provisioning status for the onboarding wizard (docs/01 §10). */
export const provisioningStatusSchema = z.object({
  tenantId: publicIdSchema,
  status: z.enum(TENANT_STATUSES),
  currentStep: z.enum(PROVISIONING_STEPS).nullable(),
  steps: z.array(
    z.object({
      step: z.enum(PROVISIONING_STEPS),
      status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED']),
      startedAt: z.string().nullable(),
      finishedAt: z.string().nullable(),
      error: z.string().nullable(),
      /** Retryable failures show a retry affordance instead of a dead end. */
      retryable: z.boolean(),
    }),
  ),
  storefrontUrl: z.string().nullable(),
});
export type ProvisioningStatus = z.infer<typeof provisioningStatusSchema>;
