import * as bcrypt from 'bcrypt';
import { newPublicId } from '@ems/kernel';
import { IsNull, type DataSource } from 'typeorm';
import { RoleEntity } from '../entities/role.entity';
import { TenantDomainEntity } from '../entities/tenant-domain.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { UserEntity } from '../entities/user.entity';
import { UserRoleEntity } from '../entities/user-role.entity';

/**
 * Demo data for local development and the tenant-isolation suite.
 *
 * **Two** tenants, not one, and deliberately with near-identical data. The
 * isolation suite works by replaying every endpoint with tenant A's token against
 * tenant B's resource ids and asserting 404. A single-tenant fixture makes that
 * test impossible to write, which is how cross-tenant leaks reach production —
 * everything passes because nothing was ever asked to fail.
 */

const DEMO_PASSWORD = 'DemoPassword123!';
const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'ems.localhost';

interface DemoTenantSpec {
  slug: string;
  businessName: string;
  contactEmail: string;
  users: { email: string; firstName: string; lastName: string; role: string }[];
}

const DEMO_TENANTS: readonly DemoTenantSpec[] = [
  {
    slug: 'northwind',
    businessName: 'Northwind Traders',
    contactEmail: 'owner@northwind.test',
    users: [
      { email: 'owner@northwind.test', firstName: 'Nadia', lastName: 'Rao', role: 'STORE_OWNER' },
      { email: 'ops@northwind.test', firstName: 'Omar', lastName: 'Shah', role: 'ORDER_MANAGER' },
    ],
  },
  {
    slug: 'lakeside',
    businessName: 'Lakeside Supply Co',
    contactEmail: 'owner@lakeside.test',
    users: [
      { email: 'owner@lakeside.test', firstName: 'Leah', lastName: 'Fernandes', role: 'STORE_OWNER' },
      { email: 'ops@lakeside.test', firstName: 'Priya', lastName: 'Menon', role: 'PRODUCT_MANAGER' },
    ],
  },
];

export interface DemoSeedResult {
  tenants: number;
  users: number;
  credentials: string[];
}

export async function seedDemoTenants(dataSource: DataSource): Promise<DemoSeedResult> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, Number(process.env.BCRYPT_ROUNDS ?? 12));
  const credentials: string[] = [];
  let userCount = 0;

  const roleRepo = dataSource.getRepository(RoleEntity);
  const systemRoles = await roleRepo.find({ where: { tenantId: IsNull() } });
  const roleByCode = new Map(systemRoles.map((r) => [r.code, r]));

  for (const spec of DEMO_TENANTS) {
    // One transaction per tenant: a half-created tenant (rows but no owner, or a
    // domain pointing at nothing) is worse than none, and would make the
    // isolation fixtures unreliable.
    await dataSource.transaction(async (manager) => {
      let tenant = await manager.findOne(TenantEntity, { where: { slug: spec.slug } });

      if (!tenant) {
        tenant = manager.create(TenantEntity, {
          publicId: newPublicId(),
          slug: spec.slug,
          businessName: spec.businessName,
          contactEmail: spec.contactEmail,
          status: 'ACTIVE',
          provisioningStep: 'COMPLETED',
          countryCode: 'IN',
          defaultCurrency: 'INR',
          defaultLocale: 'en-IN',
          timezone: 'Asia/Kolkata',
        });
        tenant = await manager.save(tenant);
      }

      const hostname = `${spec.slug}.${ROOT_DOMAIN}`;
      const existingDomain = await manager.findOne(TenantDomainEntity, { where: { hostname } });
      if (!existingDomain) {
        await manager.save(
          manager.create(TenantDomainEntity, {
            tenantId: tenant.id,
            hostname,
            type: 'SUBDOMAIN',
            isPrimary: true,
            verifiedAt: new Date(),
            // Local subdomains are served over plain HTTP; pretending a cert was
            // issued would make the domain module's states untestable.
            sslStatus: 'NONE',
          }),
        );
      }

      for (const userSpec of spec.users) {
        const emailNormalized = UserEntity.normalizeEmail(userSpec.email);

        let user = await manager.findOne(UserEntity, {
          where: { emailNormalized, tenantId: tenant.id },
        });

        if (!user) {
          user = manager.create(UserEntity, {
            publicId: newPublicId(),
            tenantId: tenant.id,
            userType: 'TENANT',
            email: userSpec.email,
            emailNormalized,
            passwordHash,
            passwordAlgo: 'bcrypt',
            passwordChangedAt: new Date(),
            firstName: userSpec.firstName,
            lastName: userSpec.lastName,
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
          });
          user = await manager.save(user);
          userCount += 1;
        }

        const role = roleByCode.get(userSpec.role);
        if (role) {
          const existingGrant = await manager.findOne(UserRoleEntity, {
            where: { userId: user.id, roleId: role.id },
          });
          if (!existingGrant) {
            await manager.save(
              manager.create(UserRoleEntity, { userId: user.id, roleId: role.id, storeId: null }),
            );
          }
        }

        credentials.push(`${userSpec.email.padEnd(26)} / ${DEMO_PASSWORD}  (${userSpec.role})`);
      }

      // Owner backlink, deferred because users.tenant_id points at tenants.id —
      // one of the two references has to be set after both rows exist.
      if (!tenant.ownerUserId) {
        const owner = await manager.findOne(UserEntity, {
          where: { tenantId: tenant.id, emailNormalized: UserEntity.normalizeEmail(spec.contactEmail) },
        });
        if (owner) {
          tenant.ownerUserId = owner.id;
          await manager.save(tenant);
        }
      }
    });
  }

  // Platform super admin. tenant_id must stay NULL — the CHECK constraint
  // `chk_users_tenant_correlation` enforces that for user_type='PLATFORM'.
  const userRepo = dataSource.getRepository(UserEntity);
  const adminEmail = 'admin@ems.test';
  const adminNormalized = UserEntity.normalizeEmail(adminEmail);

  let admin = await userRepo.findOne({
    where: { emailNormalized: adminNormalized, userType: 'PLATFORM' },
  });

  if (!admin) {
    admin = await userRepo.save(
      userRepo.create({
        publicId: newPublicId(),
        tenantId: null,
        userType: 'PLATFORM',
        email: adminEmail,
        emailNormalized: adminNormalized,
        passwordHash,
        passwordAlgo: 'bcrypt',
        passwordChangedAt: new Date(),
        firstName: 'Platform',
        lastName: 'Admin',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      }),
    );
    userCount += 1;
  }

  const superAdminRole = roleByCode.get('PLATFORM_SUPER_ADMIN');
  if (superAdminRole) {
    const userRoleRepo = dataSource.getRepository(UserRoleEntity);
    const existing = await userRoleRepo.findOne({
      where: { userId: admin.id, roleId: superAdminRole.id },
    });
    if (!existing) {
      await userRoleRepo.save(
        userRoleRepo.create({ userId: admin.id, roleId: superAdminRole.id, storeId: null }),
      );
    }
  }

  credentials.push(`${adminEmail.padEnd(26)} / ${DEMO_PASSWORD}  (PLATFORM_SUPER_ADMIN)`);

  return { tenants: DEMO_TENANTS.length, users: userCount, credentials };
}
