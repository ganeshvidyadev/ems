import 'reflect-metadata';
import { ALL_ENTITIES } from '../../src/database/entities';
import {
  PLATFORM_GLOBAL_ENTITIES,
  getTenantScopedOptions,
  isTenantScoped,
} from '../../src/common/decorators/tenant-scoped.decorator';

/**
 * Isolation **layer 3** (docs/01 §4.2): the CI gate.
 *
 * Layers 1 and 2 enforce tenancy at runtime, but both only act on entities marked
 * `@TenantScoped()`. Adding a new tenant-owned table and forgetting the decorator
 * would produce a table with no isolation at all, and nothing at runtime would
 * complain — every query would simply return every tenant's rows.
 *
 * This test closes that gap by making the omission a build failure. It is the
 * cheapest test in the suite and guards the most expensive class of bug in a
 * multi-tenant product.
 */
describe('tenant isolation coverage', () => {
  const globalNames = new Set<string>(PLATFORM_GLOBAL_ENTITIES);

  it('registers at least the Phase 1 entities', () => {
    // Guards against the registry silently emptying (a bad barrel export would
    // otherwise make every assertion below vacuously pass).
    expect(ALL_ENTITIES.length).toBeGreaterThanOrEqual(12);
  });

  it('every entity is either @TenantScoped() or explicitly allowlisted as global', () => {
    const unclassified = ALL_ENTITIES.filter(
      (entity) => !isTenantScoped(entity) && !globalNames.has(entity.name),
    ).map((entity) => entity.name);

    expect(unclassified).toEqual([]);
  });

  it('no entity is both tenant-scoped and allowlisted as global', () => {
    // A contradiction means someone added the decorator without removing the
    // allowlist entry; the allowlist would then hide a genuine scoping question.
    const contradictory = ALL_ENTITIES.filter(
      (entity) => isTenantScoped(entity) && globalNames.has(entity.name),
    ).map((entity) => entity.name);

    expect(contradictory).toEqual([]);
  });

  it('every allowlisted global entity actually exists in the registry', () => {
    const registered = new Set(ALL_ENTITIES.map((entity) => entity.name));
    const stale = [...globalNames].filter(
      (name) => !registered.has(name) && name !== 'MigrationEntity',
    );

    // A stale allowlist entry is how a table gets un-scoped: someone renames an
    // entity, the old name lingers here, and the new name silently matches nothing.
    expect(stale).toEqual([]);
  });

  it('every tenant-scoped entity resolves a usable discriminator column name', () => {
    // Only the decorator contract is asserted here. That the *column* exists in the
    // database is proven by the migration and the integration suite — a unit test
    // has no schema to check against, and instantiating entities to inspect fields
    // is unreliable because TypeScript class fields are absent until assigned.
    const invalid: string[] = [];

    for (const entity of ALL_ENTITIES) {
      if (!isTenantScoped(entity)) continue;

      const options = getTenantScopedOptions(entity);
      if (!options || typeof options.column !== 'string' || options.column.length === 0) {
        invalid.push(entity.name);
      }
    }

    expect(invalid).toEqual([]);
  });

  it('reports the current classification (documentation, not an assertion)', () => {
    const scoped = ALL_ENTITIES.filter((entity) => isTenantScoped(entity)).map((e) => e.name);
    const global = ALL_ENTITIES.filter((entity) => !isTenantScoped(entity)).map((e) => e.name);

    // Printed so a reviewer reading CI output can sanity-check the split without
    // opening the entity files.
    console.log(`  tenant-scoped (${scoped.length}): ${scoped.join(', ')}`);
    console.log(`  platform-global (${global.length}): ${global.join(', ')}`);

    expect(scoped.length + global.length).toBe(ALL_ENTITIES.length);
  });
});
