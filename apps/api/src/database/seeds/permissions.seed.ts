import type { DataSource } from 'typeorm';
import { PermissionEntity } from '../entities/permission.entity';

/**
 * The permission catalogue.
 *
 * Codes are `resource:action` and are the only thing guards check — a role is
 * just a bundle of these. Defining them declaratively here (rather than letting
 * each module invent its own strings) is what makes `PermissionsGuard` verifiable:
 * a typo in a `@Permissions()` decorator becomes a failing seed-coverage test
 * instead of an endpoint that silently denies everyone, or worse, allows everyone.
 */

interface PermissionSpec {
  resource: string;
  actions: readonly string[];
  scope: 'TENANT' | 'PLATFORM';
  description: string;
}

const CRUD = ['create', 'read', 'update', 'delete'] as const;

export const PERMISSION_SPECS: readonly PermissionSpec[] = [
  // --- Storefront catalogue ------------------------------------------------
  { resource: 'product', actions: [...CRUD, 'publish', 'import', 'export'], scope: 'TENANT', description: 'Products and variants' },
  { resource: 'category', actions: [...CRUD, 'reorder'], scope: 'TENANT', description: 'Product categories' },
  { resource: 'brand', actions: CRUD, scope: 'TENANT', description: 'Brands' },
  { resource: 'media', actions: ['create', 'read', 'delete'], scope: 'TENANT', description: 'Images and video assets' },

  // --- Inventory ----------------------------------------------------------
  { resource: 'inventory', actions: ['read', 'adjust', 'transfer', 'export'], scope: 'TENANT', description: 'Stock levels and movements' },
  { resource: 'warehouse', actions: CRUD, scope: 'TENANT', description: 'Warehouses and locations' },

  // --- Selling ------------------------------------------------------------
  {
    resource: 'order',
    // `refund` and `cancel` are separate from `update` on purpose: they move money
    // and are the actions most worth restricting to senior staff.
    actions: ['create', 'read', 'update', 'cancel', 'refund', 'fulfil', 'export', 'invoice'],
    scope: 'TENANT',
    description: 'Orders and fulfilment',
  },
  { resource: 'payment', actions: ['read', 'capture', 'refund', 'reconcile'], scope: 'TENANT', description: 'Payments' },
  { resource: 'shipment', actions: ['create', 'read', 'update', 'cancel', 'track'], scope: 'TENANT', description: 'Shipments and labels' },
  { resource: 'return', actions: ['read', 'approve', 'reject', 'receive'], scope: 'TENANT', description: 'Return requests' },
  { resource: 'cart', actions: ['read'], scope: 'TENANT', description: 'Abandoned cart visibility' },

  // --- Customers ----------------------------------------------------------
  { resource: 'customer', actions: [...CRUD, 'export', 'impersonate'], scope: 'TENANT', description: 'Customer records' },
  { resource: 'review', actions: ['read', 'moderate', 'delete', 'reply'], scope: 'TENANT', description: 'Product reviews' },
  { resource: 'loyalty', actions: ['read', 'adjust', 'configure'], scope: 'TENANT', description: 'Loyalty points' },

  // --- Marketing ----------------------------------------------------------
  { resource: 'coupon', actions: CRUD, scope: 'TENANT', description: 'Coupons and promo codes' },
  { resource: 'giftcard', actions: [...CRUD, 'adjust'], scope: 'TENANT', description: 'Gift cards' },
  { resource: 'campaign', actions: [...CRUD, 'send'], scope: 'TENANT', description: 'Email/SMS/WhatsApp campaigns' },

  // --- Storefront presentation -------------------------------------------
  { resource: 'theme', actions: ['read', 'update', 'publish', 'preview'], scope: 'TENANT', description: 'Theme configuration' },
  { resource: 'cms', actions: [...CRUD, 'publish'], scope: 'TENANT', description: 'CMS pages' },
  { resource: 'blog', actions: [...CRUD, 'publish'], scope: 'TENANT', description: 'Blog posts' },
  { resource: 'banner', actions: CRUD, scope: 'TENANT', description: 'Banners' },
  { resource: 'menu', actions: CRUD, scope: 'TENANT', description: 'Navigation menus' },
  { resource: 'seo', actions: ['read', 'update'], scope: 'TENANT', description: 'SEO settings' },

  // --- Marketplace --------------------------------------------------------
  { resource: 'marketplace', actions: ['read', 'share', 'unshare', 'accept', 'reject'], scope: 'TENANT', description: 'Supplier/reseller product sharing' },
  { resource: 'commission', actions: ['read', 'configure'], scope: 'TENANT', description: 'Commission rules' },
  { resource: 'settlement', actions: ['read', 'export'], scope: 'TENANT', description: 'Settlement statements' },
  { resource: 'channel', actions: ['read', 'connect', 'disconnect', 'sync', 'configure'], scope: 'TENANT', description: 'External sales channels' },

  // --- Tenant administration ---------------------------------------------
  { resource: 'store', actions: ['read', 'update', 'create'], scope: 'TENANT', description: 'Store profile' },
  { resource: 'settings', actions: ['read', 'update'], scope: 'TENANT', description: 'Store settings' },
  { resource: 'tax', actions: ['read', 'update'], scope: 'TENANT', description: 'Tax classes and rates' },
  { resource: 'domain', actions: ['read', 'create', 'delete', 'verify'], scope: 'TENANT', description: 'Custom domains' },
  { resource: 'user', actions: [...CRUD, 'invite', 'suspend'], scope: 'TENANT', description: 'Staff accounts' },
  { resource: 'role', actions: [...CRUD, 'assign'], scope: 'TENANT', description: 'Custom roles' },
  { resource: 'apikey', actions: ['create', 'read', 'revoke'], scope: 'TENANT', description: 'API keys' },
  { resource: 'webhook', actions: [...CRUD, 'replay'], scope: 'TENANT', description: 'Outbound webhooks' },
  { resource: 'subscription', actions: ['read', 'upgrade', 'downgrade', 'cancel'], scope: 'TENANT', description: 'Own subscription' },
  { resource: 'invoice', actions: ['read', 'download'], scope: 'TENANT', description: 'Billing invoices' },
  { resource: 'notification', actions: ['read', 'configure'], scope: 'TENANT', description: 'Notification preferences' },
  { resource: 'report', actions: ['read', 'export', 'schedule'], scope: 'TENANT', description: 'Reports' },
  { resource: 'analytics', actions: ['read'], scope: 'TENANT', description: 'Dashboards and analytics' },
  { resource: 'auditlog', actions: ['read'], scope: 'TENANT', description: 'Own audit trail' },
  { resource: 'job', actions: ['read', 'cancel', 'retry'], scope: 'TENANT', description: 'Import/export jobs' },

  // --- Platform (super admin) --------------------------------------------
  // Never grantable to a merchant: `scope: 'PLATFORM'` and the seeder refuses to
  // attach these to any TENANT-scoped role.
  { resource: 'platform.tenant', actions: ['read', 'create', 'update', 'suspend', 'reactivate', 'delete', 'impersonate'], scope: 'PLATFORM', description: 'Tenant management' },
  { resource: 'platform.plan', actions: CRUD, scope: 'PLATFORM', description: 'Subscription plans' },
  { resource: 'platform.template', actions: CRUD, scope: 'PLATFORM', description: 'Theme templates' },
  { resource: 'platform.user', actions: [...CRUD, 'suspend'], scope: 'PLATFORM', description: 'Platform staff accounts' },
  { resource: 'platform.billing', actions: ['read', 'refund', 'adjust'], scope: 'PLATFORM', description: 'Platform billing' },
  { resource: 'platform.domain', actions: ['read', 'update', 'delete'], scope: 'PLATFORM', description: 'All tenant domains' },
  { resource: 'platform.hosting', actions: ['read', 'update'], scope: 'PLATFORM', description: 'Hosting and infrastructure' },
  { resource: 'platform.log', actions: ['read'], scope: 'PLATFORM', description: 'Cross-tenant logs' },
  { resource: 'platform.analytics', actions: ['read'], scope: 'PLATFORM', description: 'Platform-wide analytics' },
  { resource: 'platform.support', actions: ['read', 'update', 'assign', 'close'], scope: 'PLATFORM', description: 'Support tickets' },
  { resource: 'platform.auditlog', actions: ['read'], scope: 'PLATFORM', description: 'Cross-tenant audit trail' },
  { resource: 'platform.settings', actions: ['read', 'update'], scope: 'PLATFORM', description: 'Platform configuration' },
  // Phase 9: batching, approving and paying out marketplace settlements
  // across every tenant — a genuinely platform-wide operation, distinct
  // from the tenant-scoped `settlement:read/export` a supplier or reseller
  // holds over their own statements.
  { resource: 'platform.settlement', actions: ['read', 'run', 'approve', 'pay', 'export'], scope: 'PLATFORM', description: 'Marketplace settlement administration' },
  // Phase 11: the queue admin — depth/failure visibility and replaying a
  // stuck job, distinct from `platform.log`'s read-only log browsing.
  { resource: 'platform.queue', actions: ['read', 'retry'], scope: 'PLATFORM', description: 'Background queue administration' },
];

export interface PermissionRow {
  code: string;
  resource: string;
  action: string;
  scope: 'TENANT' | 'PLATFORM';
  description: string;
}

export function expandPermissions(): PermissionRow[] {
  return PERMISSION_SPECS.flatMap((spec) =>
    spec.actions.map((action) => ({
      code: `${spec.resource}:${action}`,
      resource: spec.resource,
      action,
      scope: spec.scope,
      description: `${spec.description} — ${action}`,
    })),
  );
}

/**
 * Idempotent upsert.
 *
 * Seeds run on every deploy, so they must converge rather than duplicate.
 * `ON DUPLICATE KEY UPDATE` refreshes descriptions and scope while leaving
 * existing ids intact — important because `role_permissions` references them, and
 * a delete-and-reinsert would silently strip every role's grants.
 */
export async function seedPermissions(dataSource: DataSource): Promise<number> {
  const rows = expandPermissions();
  const repo = dataSource.getRepository(PermissionEntity);

  await repo
    .createQueryBuilder()
    .insert()
    .values(rows)
    .orUpdate(['resource', 'action', 'scope', 'description'], ['code'])
    // Without this, TypeORM tries to hydrate the inserted rows back onto entity
    // instances; on the ON DUPLICATE KEY path MySQL returns no usable insertId,
    // so the reload throws "entity id is not set". We do not need the entities
    // back — only that the catalogue converged.
    .updateEntity(false)
    .execute();

  return rows.length;
}
