import { IsNull, type DataSource } from 'typeorm';
import { PermissionEntity } from '../entities/permission.entity';
import { RoleEntity, type SystemRoleCode } from '../entities/role.entity';

/**
 * The twelve seeded system roles (docs/02 §4).
 *
 * All are `tenant_id IS NULL`, so one definition serves every tenant. Cloning
 * these per signup would mean thousands of duplicate rows to migrate every time a
 * permission is added — and any tenant missed by that migration would silently
 * lose or gain access.
 *
 * `permissions` accepts a glob (`product:*`) or an exact code. Globs keep the
 * definitions readable and mean a newly added action on an existing resource is
 * picked up automatically, which is the behaviour you want for a role literally
 * named "manages all products".
 */

interface RoleSpec {
  code: SystemRoleCode;
  name: string;
  scope: 'TENANT' | 'PLATFORM';
  description: string;
  permissions: readonly string[];
}

export const ROLE_SPECS: readonly RoleSpec[] = [
  // --- Platform ----------------------------------------------------------
  {
    code: 'PLATFORM_SUPER_ADMIN',
    name: 'Platform Super Admin',
    scope: 'PLATFORM',
    description: 'Unrestricted platform access',
    permissions: ['platform.*'],
  },
  {
    code: 'PLATFORM_SUPPORT',
    name: 'Platform Support',
    scope: 'PLATFORM',
    description: 'Read-only tenant access plus ticket handling and time-boxed impersonation',
    permissions: [
      'platform.tenant:read',
      // Impersonation without suspend/delete: support needs to reproduce a
      // merchant's problem, not to change their account state.
      'platform.tenant:impersonate',
      'platform.support:*',
      'platform.log:read',
      'platform.domain:read',
      'platform.user:read',
    ],
  },
  {
    code: 'PLATFORM_BILLING',
    name: 'Platform Billing',
    scope: 'PLATFORM',
    description: 'Subscription, invoice and refund administration',
    permissions: [
      'platform.tenant:read',
      'platform.plan:*',
      'platform.billing:*',
      'platform.settlement:*',
      'platform.analytics:read',
    ],
  },

  // --- Tenant ------------------------------------------------------------
  {
    code: 'STORE_OWNER',
    name: 'Store Owner',
    scope: 'TENANT',
    description: 'Full control of the tenant, including billing and staff',
    // Every TENANT-scoped permission. Expanded from the catalogue rather than
    // listed, so a new resource is never accidentally withheld from the owner.
    permissions: ['*'],
  },
  {
    code: 'STORE_ADMIN',
    name: 'Store Admin',
    scope: 'TENANT',
    description: 'Day-to-day administration; cannot change billing or delete the store',
    permissions: [
      'product:*', 'category:*', 'brand:*', 'media:*',
      'inventory:*', 'warehouse:*',
      'order:*', 'payment:*', 'shipment:*', 'return:*', 'cart:read',
      'customer:*', 'review:*', 'loyalty:*',
      'coupon:*', 'giftcard:*', 'campaign:*',
      'theme:*', 'cms:*', 'blog:*', 'banner:*', 'menu:*', 'seo:*',
      'marketplace:*', 'commission:*', 'settlement:read', 'channel:*',
      'store:read', 'store:update', 'settings:*', 'tax:*', 'domain:*',
      'user:*', 'role:*', 'apikey:*', 'webhook:*',
      'notification:*', 'report:*', 'analytics:read', 'auditlog:read', 'job:*',
      // Deliberately excluded: subscription:* and invoice:* — plan changes cost
      // money and stay with the owner.
    ],
  },
  {
    code: 'PRODUCT_MANAGER',
    name: 'Product Manager',
    scope: 'TENANT',
    description: 'Catalogue and merchandising',
    permissions: [
      'product:*', 'category:*', 'brand:*', 'media:*',
      'inventory:read', 'inventory:adjust',
      'review:read', 'review:moderate', 'review:reply',
      'seo:read', 'seo:update',
      'report:read', 'analytics:read', 'job:read',
    ],
  },
  {
    code: 'ORDER_MANAGER',
    name: 'Order Manager',
    scope: 'TENANT',
    description: 'Order processing and fulfilment',
    permissions: [
      'order:read', 'order:update', 'order:cancel', 'order:fulfil', 'order:invoice', 'order:export',
      // Refund is withheld: fulfilling an order and moving money back to a card
      // are different levels of trust.
      'payment:read',
      'shipment:*', 'return:*',
      'customer:read', 'product:read', 'inventory:read',
      'report:read', 'analytics:read', 'job:read',
    ],
  },
  {
    code: 'INVENTORY_MANAGER',
    name: 'Inventory Manager',
    scope: 'TENANT',
    description: 'Stock, warehouses and transfers',
    permissions: [
      'inventory:*', 'warehouse:*',
      'product:read', 'product:update',
      'order:read',
      'report:read', 'analytics:read', 'job:*',
    ],
  },
  {
    code: 'MARKETING_MANAGER',
    name: 'Marketing Manager',
    scope: 'TENANT',
    description: 'Promotions, content and campaigns',
    permissions: [
      'coupon:*', 'giftcard:*', 'campaign:*', 'loyalty:*',
      'cms:*', 'blog:*', 'banner:*', 'menu:*', 'seo:*', 'theme:read', 'theme:update',
      'product:read', 'category:read',
      'customer:read', 'customer:export',
      'review:read', 'review:reply',
      'report:read', 'analytics:read',
    ],
  },
  {
    code: 'CUSTOMER_SUPPORT',
    name: 'Customer Support',
    scope: 'TENANT',
    description: 'Customer-facing support with limited write access',
    permissions: [
      'customer:read', 'customer:update',
      'order:read', 'order:cancel', 'order:invoice',
      'payment:read', 'shipment:read', 'shipment:track',
      'return:read', 'return:approve',
      'review:read', 'review:reply',
      'loyalty:read', 'loyalty:adjust',
      'product:read', 'inventory:read', 'cart:read',
      'giftcard:read',
    ],
  },
  {
    code: 'SUPPLIER',
    name: 'Supplier',
    scope: 'TENANT',
    description: 'Marketplace supplier: shares products and fulfils routed orders',
    permissions: [
      'product:*', 'category:read', 'brand:read', 'media:*',
      'inventory:*', 'warehouse:*',
      'marketplace:read', 'marketplace:share', 'marketplace:unshare',
      'commission:read', 'settlement:*',
      'order:read', 'order:fulfil', 'shipment:*',
      'report:read', 'analytics:read',
    ],
  },
  {
    code: 'RESELLER',
    name: 'Reseller',
    scope: 'TENANT',
    description: 'Marketplace reseller: lists other merchants’ products',
    permissions: [
      'product:read', 'category:*', 'brand:read',
      'marketplace:read', 'marketplace:accept', 'marketplace:reject',
      'commission:read', 'settlement:read',
      'order:read', 'order:update', 'customer:*',
      'coupon:*', 'cms:*', 'blog:*', 'banner:*', 'menu:*', 'theme:*', 'seo:*',
      'report:read', 'analytics:read',
    ],
  },
];

/** Expands a glob/exact list against the catalogue, respecting scope. */
function resolvePermissions(
  patterns: readonly string[],
  all: PermissionEntity[],
  roleScope: 'TENANT' | 'PLATFORM',
): PermissionEntity[] {
  const matched = new Map<number, PermissionEntity>();

  for (const permission of all) {
    // A PLATFORM permission must never end up on a TENANT role — that would hand
    // a merchant cross-tenant access. Enforced here rather than trusted to the
    // hand-written lists above.
    if (roleScope === 'TENANT' && permission.scope === 'PLATFORM') continue;
    if (roleScope === 'PLATFORM' && permission.scope !== 'PLATFORM') continue;

    for (const pattern of patterns) {
      if (matchesPattern(permission.code, pattern)) {
        matched.set(permission.id, permission);
        break;
      }
    }
  }

  return [...matched.values()];
}

function matchesPattern(code: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === code) return true;

  // `product:*` → every action on product. `platform.*` → every platform resource.
  if (pattern.endsWith(':*')) return code.startsWith(`${pattern.slice(0, -1)}`);
  if (pattern.endsWith('.*')) return code.startsWith(pattern.slice(0, -1));

  return false;
}

export async function seedRoles(
  dataSource: DataSource,
): Promise<{ roles: number; grants: number }> {
  const permissionRepo = dataSource.getRepository(PermissionEntity);
  const roleRepo = dataSource.getRepository(RoleEntity);

  const allPermissions = await permissionRepo.find();
  if (allPermissions.length === 0) {
    throw new Error('seedRoles: permissions must be seeded first');
  }

  let grantCount = 0;

  for (const spec of ROLE_SPECS) {
    // tenant_id IS NULL identifies a system role; `tenant_scope` (the generated
    // column) makes `code` unique within that scope.
    let role = await roleRepo.findOne({
      // IsNull(), not `null` — TypeORM's FindOptionsWhere maps a bare null to a
      // type error, and `= NULL` would never match in SQL anyway.
      where: { code: spec.code, tenantId: IsNull() },
      relations: { permissions: true },
    });

    if (!role) {
      role = roleRepo.create({
        code: spec.code,
        name: spec.name,
        scope: spec.scope,
        description: spec.description,
        isSystem: true,
        tenantId: null,
      });
    } else {
      role.name = spec.name;
      role.scope = spec.scope;
      role.description = spec.description;
      role.isSystem = true;
    }

    role.permissions = resolvePermissions(spec.permissions, allPermissions, spec.scope);
    grantCount += role.permissions.length;

    await roleRepo.save(role);
  }

  return { roles: ROLE_SPECS.length, grants: grantCount };
}
