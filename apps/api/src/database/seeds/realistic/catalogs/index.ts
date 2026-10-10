import type { TenantSpec } from '../types';
import { DECORNEST } from './decornest-home';
import { ELECTROHUB } from './electrohub-india';
import { FRESHBASKET } from './freshbasket-grocery';
import { SPORTZONE } from './sportzone-india';
import { STYLEVERSE } from './styleverse-fashion';

/** The five independent tenants, in the order they are seeded. */
export const TENANT_SPECS: readonly TenantSpec[] = [ELECTROHUB, STYLEVERSE, FRESHBASKET, SPORTZONE, DECORNEST];

export const TARGETS = { products: 200, customers: 100, orders: 150 } as const;

export function findSpec(slug: string): TenantSpec | undefined {
  return TENANT_SPECS.find((spec) => spec.slug === slug);
}

/** Static sanity checks on a tenant specification; returns a list of human-readable problems. */
export function validateSpec(spec: TenantSpec): string[] {
  const problems: string[] = [];
  const brands = new Set(spec.brands.map((b) => b.slug));
  const leaves = new Set<string>();
  const allCats = new Set<string>();
  for (const cat of spec.categories) {
    allCats.add(cat.slug);
    if (!cat.children || cat.children.length === 0) leaves.add(cat.slug);
    for (const child of cat.children ?? []) {
      allCats.add(child.slug);
      leaves.add(child.slug);
    }
  }
  let total = 0;
  const ids = new Set<string>();
  for (const family of spec.families) {
    total += family.count;
    if (ids.has(family.id)) problems.push(`${spec.slug}: duplicate family id ${family.id}`);
    ids.add(family.id);
    if (!leaves.has(family.category)) problems.push(`${spec.slug}/${family.id}: unknown leaf category ${family.category}`);
    if (family.alsoIn && !allCats.has(family.alsoIn)) problems.push(`${spec.slug}/${family.id}: unknown alsoIn ${family.alsoIn}`);
    for (const b of family.brands) if (!brands.has(b)) problems.push(`${spec.slug}/${family.id}: unknown brand ${b}`);
    if (family.brands.length * family.models.length < family.count) {
      problems.push(`${spec.slug}/${family.id}: ${family.brands.length} brands x ${family.models.length} models < ${family.count}`);
    }
    if (family.type === 'VARIABLE' && (!family.axes || family.axes.length === 0)) problems.push(`${spec.slug}/${family.id}: VARIABLE without axes`);
    if (family.price[0] > family.price[1]) problems.push(`${spec.slug}/${family.id}: inverted price band`);
  }
  if (total !== TARGETS.products) problems.push(`${spec.slug}: ${total} products, expected ${TARGETS.products}`);
  if (spec.brands.length < 8 || spec.brands.length > 15) problems.push(`${spec.slug}: ${spec.brands.length} brands (expected 8-15)`);
  if (spec.categories.length < 6 || spec.categories.length > 12) problems.push(`${spec.slug}: ${spec.categories.length} top-level categories (expected 6-12)`);
  return problems;
}
