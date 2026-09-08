import 'reflect-metadata';

export const TENANT_SCOPED_KEY = 'ems:tenant-scoped';

export interface TenantScopedOptions {
  /** Column holding the tenant discriminator. Overridden only by legacy tables. */
  column?: string;
  /**
   * Allows rows with `tenant_id IS NULL` to be visible to every tenant.
   * Used by `roles`, where NULL means "system role shared by all tenants".
   */
  allowNullTenant?: boolean;
}

/**
 * Marks an entity as tenant-owned.
 *
 * This is isolation **layer 3** from docs/01 §4.2: `TenantGuardSubscriber` reads
 * this metadata to decide which entities to stamp and assert on, and a CI test
 * asserts that every entity is either marked or explicitly allowlisted as
 * platform-global. Adding a new tenant table and forgetting to scope it fails
 * the build instead of leaking data.
 */
export function TenantScoped(options: TenantScopedOptions = {}): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(
      TENANT_SCOPED_KEY,
      { column: options.column ?? 'tenantId', allowNullTenant: options.allowNullTenant ?? false },
      target,
    );
  };
}

export function getTenantScopedOptions(target: Function): Required<TenantScopedOptions> | undefined {
  return Reflect.getMetadata(TENANT_SCOPED_KEY, target);
}

export function isTenantScoped(target: Function): boolean {
  return Reflect.hasMetadata(TENANT_SCOPED_KEY, target);
}

/**
 * Entities that legitimately have no tenant column.
 *
 * This list is asserted by `test/unit/tenant-coverage.spec.ts`: an entity that is
 * neither `@TenantScoped()` nor named here fails CI. Keeping it explicit means
 * "is this table supposed to be global?" is answered by a reviewer once, at the
 * point the table is added, rather than assumed forever after.
 */
export const PLATFORM_GLOBAL_ENTITIES = [
  'TenantEntity', // the tenant registry itself
  'PermissionEntity', // global permission catalogue
  'ProcessedEventEntity', // consumer idempotency ledger, keyed by event id
  'AuditLogEntity', // must survive tenant deletion for compliance
  'MigrationEntity',

  // Join table with no tenant_id of its own — isolation is **transitive** through
  // `user_id` (users.tenant_id) and `role_id` (roles.tenant_id). Per docs/02 §1,
  // join tables do not carry the discriminator.
  //
  // The consequence is a real constraint on callers: any query that reaches
  // user_roles directly must join `users` and filter on its tenant, because this
  // table cannot be filtered on its own. Grants are normally loaded through the
  // `UserEntity.userRoles` relation, which is already scoped.
  'UserRoleEntity',

  // The SaaS's own product catalogue — plans and their quotas are a property of the
  // platform, shared by every tenant, and a tenant must never be able to edit them.
  'PlanEntity',
  'PlanLimitEntity',

  // The theme gallery every tenant picks from — platform-owned, same reasoning as `PlanEntity`.
  // `TenantThemeEntity`, the tenant's own cloned/customized copy, is `@TenantScoped()` as usual.
  'ThemeTemplateEntity',

  // The platform's own ACME account (Let's Encrypt) — one shared account issues every
  // tenant's certificate, so there is no tenant to scope it to. `TenantDomainEntity`,
  // which tracks each tenant's own verification/SSL state, is `@TenantScoped()` as usual.
  'AcmeAccountEntity',

  // Dual-tenant rows (a supplier tenant AND a reseller tenant, neither the sole
  // "owner") — the guard subscriber's single-column model doesn't fit either.
  // Authorization is explicit in the marketplace services instead. `SettlementEntity`
  // is the one marketplace table with a genuine single owner (`beneficiary_tenant_id`)
  // and IS `@TenantScoped()`, just on that column instead of the default `tenant_id`.
  'ProductShareEntity',
  'CommissionLedgerEntity',

  // `SupportTicketEntity` itself is `@TenantScoped()` now, like any other
  // tenant table — it was on this list until SEC-001 (QA Phase 6, a P0
  // cross-tenant read/write) showed that reasoning was wrong: platform staff
  // administering every tenant's tickets is a real requirement, but it does
  // not mean the rows aren't tenant-owned. See the entity's own doc comment.

  // Join-table shape, same reasoning as `UserRoleEntity`: no `tenant_id` of its
  // own, isolation is transitive through `ticket_id` (`support_tickets`,
  // which is itself tenant-scoped and checked before any message is reached).
  'SupportTicketMessageEntity',
] as const;
