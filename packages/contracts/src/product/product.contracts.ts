import { z } from 'zod';
import { booleanQuerySchema, currencyCodeSchema, publicIdSchema, slugSchema } from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const PRODUCT_TYPES = ['SIMPLE', 'VARIABLE', 'DIGITAL', 'BUNDLE', 'SERVICE'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED', 'OUT_OF_STOCK'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_VISIBILITIES = ['VISIBLE', 'HIDDEN', 'SEARCH_ONLY', 'CATALOG_ONLY'] as const;
export type ProductVisibility = (typeof PRODUCT_VISIBILITIES)[number];

/** Minor-units integer as a wire string — same convention as `plans.priceMonthlyMinor`. */
const minorAmountSchema = z.string().regex(/^\d+$/, 'Must be a non-negative integer string');

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/** `{ color: 'Blue', size: 'L' }` — keys are attribute codes marked `isVariantOption`. */
export const variantOptionValuesSchema = z.record(z.string(), z.string()).refine(
  (values) => Object.keys(values).length > 0,
  'A variant needs at least one option value',
);

export const createVariantRequestSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  barcode: z.string().trim().max(100).optional(),
  title: z.string().trim().max(255).optional(),
  optionValues: variantOptionValuesSchema,
  priceMinor: minorAmountSchema,
  comparePriceMinor: minorAmountSchema.optional(),
  costPriceMinor: minorAmountSchema.optional(),
  weightGrams: z.number().int().nonnegative().optional(),
  position: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type CreateVariantRequest = z.infer<typeof createVariantRequestSchema>;

export const updateVariantRequestSchema = createVariantRequestSchema.partial();
export type UpdateVariantRequest = z.infer<typeof updateVariantRequestSchema>;

export const variantResponseSchema = z.object({
  id: publicIdSchema,
  productId: publicIdSchema,
  sku: z.string(),
  barcode: z.string().nullable(),
  title: z.string().nullable(),
  optionValues: z.record(z.string(), z.string()),
  priceMinor: z.string(),
  comparePriceMinor: z.string().nullable(),
  position: z.number(),
  isActive: z.boolean(),
});
export type VariantResponse = z.infer<typeof variantResponseSchema>;

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

export const ATTRIBUTE_INPUT_TYPES = [
  'SELECT',
  'MULTISELECT',
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'COLOR',
] as const;

export const createProductAttributeRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, digits and underscores only'),
  name: z.string().trim().min(1).max(120),
  inputType: z.enum(ATTRIBUTE_INPUT_TYPES).default('SELECT'),
  isVariantOption: z.boolean().default(false),
  isFilterable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type CreateProductAttributeRequest = z.infer<typeof createProductAttributeRequestSchema>;

export const productAttributeResponseSchema = z.object({
  id: publicIdSchema,
  code: z.string(),
  name: z.string(),
  inputType: z.enum(ATTRIBUTE_INPUT_TYPES),
  isVariantOption: z.boolean(),
  isFilterable: z.boolean(),
  sortOrder: z.number(),
});
export type ProductAttributeResponse = z.infer<typeof productAttributeResponseSchema>;

export const setProductAttributeValueSchema = z.object({
  attributeCode: z.string().trim().min(1).max(64),
  valueText: z.string().trim().max(500).optional(),
  valueNumber: z.number().optional(),
  valueBool: z.boolean().optional(),
});
export type SetProductAttributeValue = z.infer<typeof setProductAttributeValueSchema>;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const createProductRequestSchema = z.object({
  storeId: publicIdSchema,
  brandId: publicIdSchema.optional(),
  taxClassId: publicIdSchema.optional(),
  type: z.enum(PRODUCT_TYPES).default('SIMPLE'),
  name: z.string().trim().min(1).max(500),
  slug: slugSchema.optional(),
  /** Required for every type except VARIABLE, where each variant carries its own SKU. */
  sku: z.string().trim().max(100).optional(),
  shortDescription: z.string().trim().max(1000).optional(),
  description: z.string().trim().max(200_000).optional(),
  status: z.enum(PRODUCT_STATUSES).default('DRAFT'),
  visibility: z.enum(PRODUCT_VISIBILITIES).default('VISIBLE'),
  priceMinor: minorAmountSchema.default('0'),
  comparePriceMinor: minorAmountSchema.optional(),
  costPriceMinor: minorAmountSchema.optional(),
  currency: currencyCodeSchema.default('INR'),
  trackInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  weightGrams: z.number().int().nonnegative().optional(),
  lengthMm: z.number().int().nonnegative().optional(),
  widthMm: z.number().int().nonnegative().optional(),
  heightMm: z.number().int().nonnegative().optional(),
  barcode: z.string().trim().max(100).optional(),
  hsnCode: z.string().trim().max(20).optional(),
  requiresShipping: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isShareable: z.boolean().default(false),
  metaTitle: z.string().trim().max(255).optional(),
  metaDescription: z.string().trim().max(500).optional(),
  metaKeywords: z.string().trim().max(500).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  categoryIds: z.array(publicIdSchema).optional(),
  primaryCategoryId: publicIdSchema.optional(),
  variants: z.array(createVariantRequestSchema).optional(),
  attributeValues: z.array(setProductAttributeValueSchema).optional(),
})
  .refine((p) => p.type === 'VARIABLE' || Boolean(p.sku), {
    message: 'sku is required unless type is VARIABLE',
    path: ['sku'],
  })
  .refine((p) => p.type !== 'VARIABLE' || (p.variants && p.variants.length > 0), {
    message: 'a VARIABLE product needs at least one variant',
    path: ['variants'],
  });
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

const updatableProductFields = createProductRequestSchema.innerType().innerType();
export const updateProductRequestSchema = updatableProductFields
  .omit({ storeId: true, type: true, variants: true })
  .partial();
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

export const productResponseSchema = z.object({
  id: publicIdSchema,
  storeId: publicIdSchema,
  brandId: publicIdSchema.nullable(),
  taxClassId: publicIdSchema.nullable(),
  type: z.enum(PRODUCT_TYPES),
  name: z.string(),
  slug: z.string(),
  sku: z.string().nullable(),
  shortDescription: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(PRODUCT_STATUSES),
  visibility: z.enum(PRODUCT_VISIBILITIES),
  priceMinor: z.string(),
  comparePriceMinor: z.string().nullable(),
  /** Console-only — the storefront response omits this field entirely. */
  costPriceMinor: z.string().nullable().optional(),
  currency: z.string(),
  trackInventory: z.boolean(),
  allowBackorder: z.boolean(),
  lowStockThreshold: z.number().nullable(),
  barcode: z.string().nullable(),
  hsnCode: z.string().nullable(),
  requiresShipping: z.boolean(),
  isFeatured: z.boolean(),
  isShareable: z.boolean(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  metaKeywords: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()).nullable(),
  ratingAverage: z.string(),
  ratingCount: z.number(),
  publishedAt: z.string().nullable(),
  variants: z.array(variantResponseSchema).optional(),
  categoryIds: z.array(publicIdSchema).optional(),
  primaryCategoryId: publicIdSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProductResponse = z.infer<typeof productResponseSchema>;

export const productListQuerySchema = listQuerySchema.extend({
  status: z.enum(PRODUCT_STATUSES).optional(),
  visibility: z.enum(PRODUCT_VISIBILITIES).optional(),
  type: z.enum(PRODUCT_TYPES).optional(),
  brandId: publicIdSchema.optional(),
  categoryId: publicIdSchema.optional(),
  storeId: publicIdSchema.optional(),
  isFeatured: booleanQuerySchema.optional(),
  sort: sortQuerySchema(
    ['publishedAt', 'name', 'priceMinor', 'createdAt', 'totalSold'] as const,
    [{ field: 'publishedAt', direction: 'DESC' }],
  ),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

// ---------------------------------------------------------------------------
// Bulk import / export
// ---------------------------------------------------------------------------

export const IMPORT_EXPORT_FORMATS = ['CSV', 'XLSX'] as const;

/** The client uploads the file directly to S3 via a presigned URL first, then posts the key here. */
export const productImportRequestSchema = z.object({
  storeId: publicIdSchema,
  storageKey: z.string().trim().min(1).max(500),
  format: z.enum(IMPORT_EXPORT_FORMATS),
});
export type ProductImportRequest = z.infer<typeof productImportRequestSchema>;

export const productExportRequestSchema = z.object({
  format: z.enum(IMPORT_EXPORT_FORMATS).default('CSV'),
  storeId: publicIdSchema.optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  categoryId: publicIdSchema.optional(),
});
export type ProductExportRequest = z.infer<typeof productExportRequestSchema>;

export const productExportResponseSchema = z.object({
  jobId: z.string(),
  downloadUrl: z.string(),
  rowCount: z.number(),
});
export type ProductExportResponse = z.infer<typeof productExportResponseSchema>;

/** Columns a CSV/XLSX import row is mapped to — also doubles as the export column order. */
export const PRODUCT_IMPORT_COLUMNS = [
  'sku',
  'name',
  'type',
  'status',
  'visibility',
  'priceMinor',
  'comparePriceMinor',
  'currency',
  'brandSlug',
  'categorySlug',
  'shortDescription',
  'barcode',
  'hsnCode',
  'trackInventory',
] as const;
