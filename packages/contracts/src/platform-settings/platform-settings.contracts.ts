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

export const platformSettingsResponseSchema = z.object({
  maintenanceMode: maintenanceModeSettingSchema,
  supportSlaHours: supportSlaHoursSettingSchema,
});
export type PlatformSettingsResponse = z.infer<typeof platformSettingsResponseSchema>;

export const updatePlatformSettingsRequestSchema = z.object({
  maintenanceMode: maintenanceModeSettingSchema.optional(),
  supportSlaHours: supportSlaHoursSettingSchema.optional(),
});
export type UpdatePlatformSettingsRequest = z.infer<typeof updatePlatformSettingsRequestSchema>;
