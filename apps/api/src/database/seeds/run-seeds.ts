import 'reflect-metadata';
import dataSource from '../data-source';
import { seedPermissions } from './permissions.seed';
import { seedRoles } from './roles.seed';
import { seedPlans } from './plans.seed';
import { seedDemoTenants } from './demo-tenant.seed';

/**
 * Seed runner.
 *
 * Every seed is idempotent, because this runs on each deploy and must converge
 * rather than duplicate. Reference data (permissions, roles) always runs; demo
 * data only outside production, where inventing two fake tenants would be a
 * genuine incident rather than a convenience.
 */
async function main(): Promise<void> {
  const includeDemo = process.env.NODE_ENV !== 'production' && !process.argv.includes('--no-demo');

  console.log('▶ Connecting…');
  await dataSource.initialize();

  try {
    const pending = await dataSource.showMigrations();
    if (pending) {
      throw new Error(
        'Pending migrations detected. Run `pnpm run migration:run` before seeding — ' +
          'seeding against an older schema fails in confusing ways.',
      );
    }

    console.log('▶ Seeding permissions…');
    const permissions = await seedPermissions(dataSource);
    console.log(`  ✔ ${permissions} permissions`);

    console.log('▶ Seeding system roles…');
    const { roles, grants } = await seedRoles(dataSource);
    console.log(`  ✔ ${roles} roles, ${grants} permission grants`);

    console.log('▶ Seeding plans…');
    const { plans, limits } = await seedPlans(dataSource);
    console.log(`  ✔ ${plans} plans, ${limits} quota limits`);

    if (includeDemo) {
      console.log('▶ Seeding demo tenants…');
      const demo = await seedDemoTenants(dataSource);
      console.log(`  ✔ ${demo.tenants} tenants, ${demo.users} users`);
      for (const line of demo.credentials) console.log(`     ${line}`);
    } else {
      console.log('▷ Skipping demo data');
    }

    console.log('\n✅ Seeding complete');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('\n❌ Seeding failed:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exit(1);
});
