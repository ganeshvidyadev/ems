import { z } from 'zod';
import {
  emailSchema,
  passwordSchema,
  phoneSchema,
  publicIdSchema,
} from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const USER_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'LOCKED',
  'DEACTIVATED',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Staff invitations
// ---------------------------------------------------------------------------

export const createInvitationRequestSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  /**
   * Role codes, not ids. Ids are internal and would leak row counts; codes are
   * stable, reviewable in an audit log, and meaningful in an API request.
   */
  roleCodes: z.array(z.string().trim().min(1).max(64)).min(1, 'Assign at least one role'),
  /** Omit to grant across every store of the tenant. */
  storeId: publicIdSchema.optional(),
});
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const invitationResponseSchema = z.object({
  id: publicIdSchema,
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  roles: z.array(z.string()),
  storeId: publicIdSchema.nullable(),
  status: z.enum(INVITATION_STATUSES),
  invitedBy: z.string().nullable(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  resentCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type InvitationResponse = z.infer<typeof invitationResponseSchema>;

export const invitationListQuerySchema = listQuerySchema.extend({
  status: z.enum(INVITATION_STATUSES).optional(),
  sort: sortQuerySchema(['createdAt', 'email', 'status'] as const),
});

/**
 * Accepting an invitation.
 *
 * The invitee sets their own password here — the invite email never contains one.
 * Emailing a temporary password means the credential lives in an inbox indefinitely and
 * is very often never changed.
 */
export const acceptInvitationRequestSchema = z
  .object({
    token: z.string().min(20).max(512),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100).optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
    phone: phoneSchema.optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

/**
 * Public preview of an invitation, fetched before acceptance.
 *
 * Lets the accept page show "You've been invited to Northwind Traders as Order Manager"
 * instead of a bare password form. Deliberately minimal: it is reachable with only a
 * token, so it must not expose the inviter's email, the tenant's id, or any staff list.
 */
export const invitationPreviewSchema = z.object({
  email: z.string(),
  storeName: z.string(),
  roles: z.array(z.string()),
  invitedByName: z.string().nullable(),
  expiresAt: z.string(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

// ---------------------------------------------------------------------------
// Staff management
// ---------------------------------------------------------------------------

export const staffUserResponseSchema = z.object({
  id: publicIdSchema,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  status: z.enum(USER_STATUSES),
  emailVerified: z.boolean(),
  mfaEnabled: z.boolean(),
  roles: z.array(z.string()),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type StaffUserResponse = z.infer<typeof staffUserResponseSchema>;

export const staffListQuerySchema = listQuerySchema.extend({
  status: z.enum(USER_STATUSES).optional(),
  roleCode: z.string().optional(),
  sort: sortQuerySchema(['createdAt', 'firstName', 'email', 'lastLoginAt'] as const),
});

export const updateStaffRolesRequestSchema = z.object({
  roleCodes: z.array(z.string().trim().min(1).max(64)).min(1),
  storeId: publicIdSchema.nullable().optional(),
});

export const updateProfileRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  phone: phoneSchema.optional(),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(64).optional(),
  avatarUrl: z.string().url().max(500).optional(),
});
