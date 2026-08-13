import { newPublicId } from '@ems/kernel';
import * as bcrypt from 'bcrypt';
import { DataSource, IsNull } from 'typeorm';
import {
  RoleEntity,
  TenantEntity,
  UserEntity,
  UserRoleEntity,
} from '../../src/database/entities';

export const FIXTURE_PASSWORD = 'FixturePassword123!';

export interface TenantFixture {
  tenantId: string;
  tenantPublicId: string;
  slug: string;
  ownerId: string;
  ownerEmail: string;
}

/**
 * Creates a tenant with an owner, ready to log in.
 *
 * Fixtures are built with a **low bcrypt cost**. At the production cost of 12 each hash
 * takes ~250 ms, so a suite creating a dozen users would spend several seconds doing
 * nothing but key stretching. Cost 4 is cryptographically useless and entirely
 * appropriate for a throwaway row — the hashing *path* is still exercised, only the work
 * factor differs.
 */
export async function createTenantWithOwner(
  dataSource: DataSource,
  slug: string,
  roleCode = 'STORE_OWNER',
): Promise<TenantFixture> {
  const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 4);
  const email = `owner@${slug}.test`;

  return dataSource.transaction(async (manager) => {
    const tenant = await manager.save(
      manager.create(TenantEntity, {
        publicId: newPublicId(),
        slug,
        businessName: `${slug} Ltd`,
        contactEmail: email,
        status: 'ACTIVE',
        provisioningStep: 'COMPLETED',
      }),
    );

    const user = await manager.save(
      manager.create(UserEntity, {
        publicId: newPublicId(),
        tenantId: tenant.id,
        userType: 'TENANT',
        email,
        emailNormalized: UserEntity.normalizeEmail(email),
        passwordHash,
        passwordAlgo: 'bcrypt',
        passwordChangedAt: new Date(),
        firstName: 'Owner',
        lastName: slug,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      }),
    );

    tenant.ownerUserId = user.id;
    await manager.save(tenant);

    const role = await manager.findOne(RoleEntity, {
      where: { code: roleCode, tenantId: IsNull() },
    });
    if (role) {
      await manager.save(
        manager.create(UserRoleEntity, { userId: user.id, roleId: role.id, storeId: null }),
      );
    }

    return {
      tenantId: tenant.id,
      tenantPublicId: tenant.publicId,
      slug,
      ownerId: user.id,
      ownerEmail: email,
    };
  });
}

/** Adds a staff user to an existing tenant with a specific role. */
export async function createStaffUser(
  dataSource: DataSource,
  tenantId: string,
  email: string,
  roleCode: string,
): Promise<{ userId: string; email: string }> {
  const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 4);

  return dataSource.transaction(async (manager) => {
    const user = await manager.save(
      manager.create(UserEntity, {
        publicId: newPublicId(),
        tenantId,
        userType: 'TENANT',
        email,
        emailNormalized: UserEntity.normalizeEmail(email),
        passwordHash,
        passwordAlgo: 'bcrypt',
        passwordChangedAt: new Date(),
        firstName: 'Staff',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      }),
    );

    const role = await manager.findOne(RoleEntity, {
      where: { code: roleCode, tenantId: IsNull() },
    });
    if (role) {
      await manager.save(
        manager.create(UserRoleEntity, { userId: user.id, roleId: role.id, storeId: null }),
      );
    }

    return { userId: user.id, email };
  });
}

/** Extracts the refresh cookie value from a supertest `set-cookie` header. */
export function extractRefreshCookie(setCookie: string[] | string | undefined): string | null {
  if (!setCookie) return null;
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];

  for (const header of headers) {
    const match = /ems_refresh=([^;]+)/.exec(header);
    if (match?.[1]) return match[1];
  }
  return null;
}
