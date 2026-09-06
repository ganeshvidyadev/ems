import { z } from 'zod';
import { emailSchema, phoneSchema, publicIdSchema, shortTextSchema } from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const CUSTOMER_STATUSES = ['ACTIVE', 'BLOCKED', 'DEACTIVATED'] as const;

export const createCustomerRequestSchema = z
  .object({
    storeId: publicIdSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(8).max(128).optional(),
    firstName: shortTextSchema(100).optional(),
    lastName: shortTextSchema(100).optional(),
    acceptsMarketing: z.boolean().default(false),
  })
  .refine((v) => v.email ?? v.phone, {
    message: 'Either email or phone is required',
    path: ['email'],
  });
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;

export const updateCustomerRequestSchema = z.object({
  firstName: shortTextSchema(100).optional(),
  lastName: shortTextSchema(100).optional(),
  dateOfBirth: z.string().date().optional(),
  gender: z.string().max(20).optional(),
  acceptsMarketing: z.boolean().optional(),
  customerGroup: z.string().max(64).nullable().optional(),
  taxExempt: z.boolean().optional(),
  taxRegistration: z.string().max(64).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  tags: z.array(z.string().max(64)).max(50).optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
});
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;

export const customerResponseSchema = z.object({
  id: publicIdSchema,
  storeId: publicIdSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  displayName: z.string(),
  status: z.enum(CUSTOMER_STATUSES),
  isGuest: z.boolean(),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  acceptsMarketing: z.boolean(),
  customerGroup: z.string().nullable(),
  taxExempt: z.boolean(),
  loyaltyPoints: z.number().int(),
  totalOrders: z.number().int(),
  totalSpentMinor: z.string(),
  averageOrderMinor: z.string(),
  currency: z.string().length(3).optional(),
  tags: z.array(z.string()).nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomerResponse = z.infer<typeof customerResponseSchema>;

export const customerListQuerySchema = listQuerySchema.extend({
  storeId: publicIdSchema.optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  sort: sortQuerySchema(['createdAt', 'totalSpentMinor', 'lastOrderAt'] as const, [
    { field: 'createdAt', direction: 'DESC' },
  ]),
});

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export const ADDRESS_TYPES = ['SHIPPING', 'BILLING', 'BOTH'] as const;

export const addressRequestSchema = z.object({
  label: z.string().trim().max(64).optional(),
  type: z.enum(ADDRESS_TYPES).default('BOTH'),
  recipientName: shortTextSchema(200),
  phone: phoneSchema.optional(),
  addressLine1: shortTextSchema(255),
  addressLine2: z.string().trim().max(255).optional(),
  landmark: z.string().trim().max(255).optional(),
  city: shortTextSchema(120),
  stateCode: z.string().trim().max(10).optional(),
  stateName: z.string().trim().max(120).optional(),
  postalCode: shortTextSchema(20),
  countryCode: z.string().length(2).toUpperCase().default('IN'),
  isDefaultShipping: z.boolean().default(false),
  isDefaultBilling: z.boolean().default(false),
});
export type AddressRequest = z.infer<typeof addressRequestSchema>;

export const updateAddressRequestSchema = addressRequestSchema.partial();
export type UpdateAddressRequest = z.infer<typeof updateAddressRequestSchema>;

export const addressResponseSchema = z.object({
  id: publicIdSchema,
  label: z.string().nullable(),
  type: z.enum(ADDRESS_TYPES),
  recipientName: z.string(),
  phone: z.string().nullable(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  landmark: z.string().nullable(),
  city: z.string(),
  stateCode: z.string().nullable(),
  stateName: z.string().nullable(),
  postalCode: z.string(),
  countryCode: z.string(),
  isDefaultShipping: z.boolean(),
  isDefaultBilling: z.boolean(),
  createdAt: z.string(),
});
export type AddressResponse = z.infer<typeof addressResponseSchema>;

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

export const addWishlistItemRequestSchema = z.object({
  productId: publicIdSchema,
  variantId: publicIdSchema.optional(),
});
export type AddWishlistItemRequest = z.infer<typeof addWishlistItemRequestSchema>;

export const wishlistItemResponseSchema = z.object({
  productId: publicIdSchema,
  variantId: publicIdSchema.nullable(),
  addedAt: z.string(),
});
export type WishlistItemResponse = z.infer<typeof wishlistItemResponseSchema>;

// ---------------------------------------------------------------------------
// Storefront identity (OTP / password login)
// ---------------------------------------------------------------------------

export const customerRegisterRequestSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(8).max(128).optional(),
    firstName: shortTextSchema(100).optional(),
    lastName: shortTextSchema(100).optional(),
    acceptsMarketing: z.boolean().default(false),
  })
  .refine((v) => v.email ?? v.phone, { message: 'Either email or phone is required' });
export type CustomerRegisterRequest = z.infer<typeof customerRegisterRequestSchema>;

export const customerLoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type CustomerLoginRequest = z.infer<typeof customerLoginRequestSchema>;

export const customerOtpRequestSchema = z.object({
  phone: phoneSchema,
});
export type CustomerOtpRequest = z.infer<typeof customerOtpRequestSchema>;

export const customerOtpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().length(6),
});
export type CustomerOtpVerify = z.infer<typeof customerOtpVerifySchema>;

export const customerSessionResponseSchema = z.object({
  accessToken: z.string(),
  customer: customerResponseSchema,
});
export type CustomerSessionResponse = z.infer<typeof customerSessionResponseSchema>;
