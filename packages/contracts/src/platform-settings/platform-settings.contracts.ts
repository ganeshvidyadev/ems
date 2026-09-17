import { z } from 'zod';

export const SUPPORT_TICKET_PRIORITIES_FOR_SLA = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export const maintenanceModeSettingSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(500).default('The platform is temporarily down for maintenance.'),
});
export type MaintenanceModeSetting = z.infer<typeof maintenanceModeSettingSchema>;

export const supportSlaHoursSettingSchema = z.object({
  LOW: z.number().int().min(1).max(720),
  NORMAL: z.number().int().min(1).max(720),
  HIGH: z.number().int().min(1).max(720),
  URGENT: z.number().int().min(1).max(720),
});
export type SupportSlaHoursSetting = z.infer<typeof supportSlaHoursSettingSchema>;

export const platformFeatureFlagsSchema = z.object({
  enableMarketplace: z.boolean().default(true),
  enableCustomDomains: z.boolean().default(true),
  enableAdvancedAnalytics: z.boolean().default(true),
  betaStorefrontThemes: z.boolean().default(false),
  aiCopilotAssistant: z.boolean().default(false),
});
export type PlatformFeatureFlags = z.infer<typeof platformFeatureFlagsSchema>;

export const platformSecurityPolicySchema = z.object({
  sessionIdleTimeoutMinutes: z.number().int().min(5).max(1440).default(60),
  maxConcurrentSessionsPerUser: z.number().int().min(1).max(50).default(10),
  enforceMfaForStaff: z.boolean().default(false),
});
export type PlatformSecurityPolicy = z.infer<typeof platformSecurityPolicySchema>;

export const platformDataRetentionSchema = z.object({
  softDeleteRetentionDays: z.number().int().min(7).max(365).default(30),
  auditLogRetentionDays: z.number().int().min(30).max(3650).default(365),
  autoPurgeDeletedTenants: z.boolean().default(false),
});
export type PlatformDataRetention = z.infer<typeof platformDataRetentionSchema>;

export const tenantFeatureFlagsSchema = z.object({
  enableMarketplace: z.boolean().nullable().default(null),
  enableCustomDomains: z.boolean().nullable().default(null),
  enableAdvancedAnalytics: z.boolean().nullable().default(null),
  betaStorefrontThemes: z.boolean().nullable().default(null),
  aiCopilotAssistant: z.boolean().nullable().default(null),
});
export type TenantFeatureFlags = z.infer<typeof tenantFeatureFlagsSchema>;

export const updateTenantFeatureFlagsRequestSchema = z.object({
  featureFlags: tenantFeatureFlagsSchema,
});
export type UpdateTenantFeatureFlagsRequest = z.infer<typeof updateTenantFeatureFlagsRequestSchema>;

export const platformSettingsResponseSchema = z.object({
  maintenanceMode: maintenanceModeSettingSchema,
  supportSlaHours: supportSlaHoursSettingSchema,
  featureFlags: platformFeatureFlagsSchema,
  securityPolicy: platformSecurityPolicySchema,
  dataRetention: platformDataRetentionSchema,
});
export type PlatformSettingsResponse = z.infer<typeof platformSettingsResponseSchema>;

export const updatePlatformSettingsRequestSchema = z.object({
  maintenanceMode: maintenanceModeSettingSchema.optional(),
  supportSlaHours: supportSlaHoursSettingSchema.optional(),
  featureFlags: platformFeatureFlagsSchema.partial().optional(),
  securityPolicy: platformSecurityPolicySchema.partial().optional(),
  dataRetention: platformDataRetentionSchema.partial().optional(),
});
export type UpdatePlatformSettingsRequest = z.infer<typeof updatePlatformSettingsRequestSchema>;

