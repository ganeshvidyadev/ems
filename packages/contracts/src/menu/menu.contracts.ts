import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';

export const MENU_ITEM_LINK_TYPES = ['CATEGORY', 'PRODUCT', 'PAGE', 'BLOG', 'URL', 'COLLECTION'] as const;

export const createMenuRequestSchema = z.object({
  storeId: publicIdSchema.optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and hyphens only'),
  name: z.string().trim().min(1).max(120),
});
export type CreateMenuRequest = z.infer<typeof createMenuRequestSchema>;

export const menuItemInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  linkType: z.enum(MENU_ITEM_LINK_TYPES),
  /** The raw URL for `linkType: 'URL'`; a public id for every reference-based link type. */
  linkTarget: z.string().max(500).optional(),
  icon: z.string().max(64).optional(),
  openInNewTab: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type MenuItemInput = z.infer<typeof menuItemInputSchema>;

export const createMenuItemRequestSchema = menuItemInputSchema.extend({
  parentId: z.string().optional(),
});
export type CreateMenuItemRequest = z.infer<typeof createMenuItemRequestSchema>;

export const updateMenuItemRequestSchema = createMenuItemRequestSchema.partial();
export type UpdateMenuItemRequest = z.infer<typeof updateMenuItemRequestSchema>;

export const reorderMenuItemsRequestSchema = z.object({
  parentId: z.string().nullable(),
  orderedIds: z.array(z.string()).min(1),
});
export type ReorderMenuItemsRequest = z.infer<typeof reorderMenuItemsRequestSchema>;

export const menuItemResponseSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  label: z.string(),
  linkType: z.enum(MENU_ITEM_LINK_TYPES),
  linkTarget: z.string().nullable(),
  icon: z.string().nullable(),
  openInNewTab: z.boolean(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  children: z.array(z.lazy((): z.ZodTypeAny => menuItemResponseSchema)).optional(),
});
export type MenuItemResponse = z.infer<typeof menuItemResponseSchema>;

export const menuResponseSchema = z.object({
  id: z.string(),
  storeId: publicIdSchema,
  code: z.string(),
  name: z.string(),
  items: z.array(menuItemResponseSchema),
});
export type MenuResponse = z.infer<typeof menuResponseSchema>;
