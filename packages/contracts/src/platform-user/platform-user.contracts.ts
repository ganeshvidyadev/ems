import { z } from 'zod';
import { emailSchema, publicIdSchema } from '../common/primitives.js';

/** The three platform-scoped system roles seeded in `roles.seed.ts` — the
 * only roles a platform staff account can hold. */
export const PLATFORM_ROLE_CODES = ['PLATFORM_SUPER_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_BILLING'] as const;
export type PlatformRoleCode = (typeof PLATFORM_ROLE_CODES)[number];

export const PLATFORM_USER_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'LOCKED',
  'DEACTIVATED',
] as const;
export type PlatformUserStatus = (typeof PLATFORM_USER_STATUSES)[number];

export const createPlatformUserRequestSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  /** Set directly by the admin creating the account — there is no public
   * self-signup path for platform staff, so the email-verification/invite
   * flow tenant registration uses doesn't apply here. */
  password: z.string().min(8).max(128),
  roleCodes: z.array(z.enum(PLATFORM_ROLE_CODES)).min(1),
});
export type CreatePlatformUserRequest = z.infer<typeof createPlatformUserRequestSchema>;

export const updatePlatformUserRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).nullable().optional(),
  roleCodes: z.array(z.enum(PLATFORM_ROLE_CODES)).min(1).optional(),
});
export type UpdatePlatformUserRequest = z.infer<typeof updatePlatformUserRequestSchema>;

export const suspendPlatformUserRequestSchema = z.object({
  reason: z.string().trim().min(5).max(255),
});
export type SuspendPlatformUserRequest = z.infer<typeof suspendPlatformUserRequestSchema>;

export const platformUserResponseSchema = z.object({
  id: publicIdSchema,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  status: z.enum(PLATFORM_USER_STATUSES),
  roles: z.array(z.enum(PLATFORM_ROLE_CODES)),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  /** True for the account making the request — the UI hides self-suspend/delete on it. */
  isSelf: z.boolean(),
});
export type PlatformUserResponse = z.infer<typeof platformUserResponseSchema>;
