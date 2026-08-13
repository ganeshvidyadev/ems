import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema, publicIdSchema } from '../common/primitives.js';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const registerRequestSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100).optional(),
    phone: phoneSchema.optional(),
    businessName: z.string().trim().min(2).max(255),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms of service' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  /** Optional: scopes login to one tenant when the email exists in several. */
  tenantSlug: z.string().trim().max(63).optional(),
  rememberDevice: z.boolean().default(false),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userSummarySchema = z.object({
  id: publicIdSchema,
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  userType: z.enum(['PLATFORM', 'TENANT']),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'LOCKED', 'DEACTIVATED']),
  emailVerified: z.boolean(),
  mfaEnabled: z.boolean(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  tenant: z
    .object({
      id: publicIdSchema,
      slug: z.string(),
      businessName: z.string(),
      status: z.string(),
      plan: z.string().nullable(),
    })
    .nullable(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

/**
 * Login outcome.
 *
 * A discriminated union rather than an optional-fields object: "MFA required" is
 * a legitimate, successful step in the flow, and modelling it as a variant stops
 * a client from reading `accessToken` when there isn't one.
 */
export const loginResponseSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('AUTHENTICATED'),
    accessToken: z.string(),
    /** Seconds until the access token expires — clients schedule silent refresh from this. */
    expiresIn: z.number().int().positive(),
    tokenType: z.literal('Bearer'),
    user: userSummarySchema,
  }),
  z.object({
    outcome: z.literal('MFA_REQUIRED'),
    /** Short-lived, single-purpose token — not an access token. */
    mfaToken: z.string(),
    methods: z.array(z.enum(['TOTP', 'RECOVERY_CODE'])),
  }),
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

// The refresh token itself travels only in an httpOnly cookie, so the refresh
// request body is empty by design — nothing for a client script to read or leak.
export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  tokenType: z.literal('Bearer'),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

// ---------------------------------------------------------------------------
// Email verification & password reset
// ---------------------------------------------------------------------------

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(20).max(512),
});

export const resendVerificationRequestSchema = z.object({
  email: emailSchema,
});

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordRequestSchema = z
  .object({
    token: z.string().min(20).max(512),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must differ from the current password',
    path: ['newPassword'],
  });

/**
 * Deliberately generic. Every one of these endpoints returns the same body and
 * status whether or not the account exists — a differing response is an account
 * enumeration oracle.
 */
export const genericAcknowledgementSchema = z.object({
  message: z.string(),
});

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export const OTP_PURPOSES = ['LOGIN', 'PHONE_VERIFY', 'EMAIL_VERIFY', 'TRANSACTION'] as const;

export const requestOtpSchema = z
  .object({
    purpose: z.enum(OTP_PURPOSES).default('LOGIN'),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .refine((data) => Boolean(data.email) !== Boolean(data.phone), {
    message: 'Provide exactly one of email or phone',
  });

export const verifyOtpSchema = z
  .object({
    purpose: z.enum(OTP_PURPOSES).default('LOGIN'),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    code: z.string().regex(/^\d{6}$/, 'Must be a 6-digit code'),
  })
  .refine((data) => Boolean(data.email) !== Boolean(data.phone), {
    message: 'Provide exactly one of email or phone',
  });

// ---------------------------------------------------------------------------
// MFA (TOTP)
// ---------------------------------------------------------------------------

export const mfaEnrolResponseSchema = z.object({
  secret: z.string(),
  otpauthUri: z.string(),
  qrCodeDataUrl: z.string(),
});

export const mfaConfirmRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const mfaConfirmResponseSchema = z.object({
  /** Shown exactly once. Stored hashed, so they cannot be re-displayed later. */
  recoveryCodes: z.array(z.string()),
});

export const mfaVerifyRequestSchema = z.object({
  mfaToken: z.string().min(20),
  code: z.string().min(6).max(20),
  method: z.enum(['TOTP', 'RECOVERY_CODE']).default('TOTP'),
});

export const mfaDisableRequestSchema = z.object({
  password: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const sessionSchema = z.object({
  id: publicIdSchema,
  deviceLabel: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string(),
  isCurrent: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

export const revokeSessionParamsSchema = z.object({
  sessionId: publicIdSchema,
});
