import { z } from 'zod';
import { countryCodeSchema, publicIdSchema } from '../common/primitives.js';

export const createTaxClassRequestSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  isDefault: z.boolean().default(false),
});
export type CreateTaxClassRequest = z.infer<typeof createTaxClassRequestSchema>;

export const updateTaxClassRequestSchema = createTaxClassRequestSchema.omit({ code: true }).partial();
export type UpdateTaxClassRequest = z.infer<typeof updateTaxClassRequestSchema>;

export const taxClassResponseSchema = z.object({
  id: publicIdSchema,
  code: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});
export type TaxClassResponse = z.infer<typeof taxClassResponseSchema>;

export const taxRateComponentSchema = z.object({
  name: z.string().trim().min(1).max(64),
  rate: z.number().min(0).max(100),
});

export const createTaxRateRequestSchema = z.object({
  taxClassId: publicIdSchema,
  name: z.string().trim().min(1).max(120),
  countryCode: countryCodeSchema,
  stateCode: z.string().trim().max(10).optional(),
  postalPattern: z.string().trim().max(64).optional(),
  rate: z.number().min(0).max(100),
  compound: z.boolean().default(false),
  priority: z.number().int().default(0),
  isInclusive: z.boolean().default(false),
  components: z.array(taxRateComponentSchema).optional(),
  effectiveFrom: z.string().date().optional(),
  effectiveTo: z.string().date().optional(),
});
export type CreateTaxRateRequest = z.infer<typeof createTaxRateRequestSchema>;

export const updateTaxRateRequestSchema = createTaxRateRequestSchema
  .omit({ taxClassId: true })
  .partial();
export type UpdateTaxRateRequest = z.infer<typeof updateTaxRateRequestSchema>;

export const taxRateResponseSchema = z.object({
  id: publicIdSchema,
  taxClassId: publicIdSchema,
  name: z.string(),
  countryCode: z.string(),
  stateCode: z.string().nullable(),
  postalPattern: z.string().nullable(),
  rate: z.string(),
  compound: z.boolean(),
  priority: z.number(),
  isInclusive: z.boolean(),
  components: z.array(taxRateComponentSchema).nullable(),
  effectiveFrom: z.string().nullable(),
  effectiveTo: z.string().nullable(),
  createdAt: z.string(),
});
export type TaxRateResponse = z.infer<typeof taxRateResponseSchema>;
