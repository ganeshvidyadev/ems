import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessRuleError, ConflictError, NotFoundError } from '@ems/kernel';
import type {
  CreatePlatformUserRequest,
  PlatformRoleCode,
  PlatformUserResponse,
  UpdatePlatformUserRequest,
} from '@ems/contracts';
import { HashService } from '../../common/services/hash.service';
import { RoleEntity, UserEntity, UserRoleEntity } from '../../database/entities';
import { RefreshTokenService } from '../auth/services/refresh-token.service';

@Injectable()
export class PlatformUserService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly hasher: HashService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async list(actorId: string): Promise<PlatformUserResponse[]> {
    const users = await this.dataSource
      .getRepository(UserEntity)
      .find({ where: { userType: 'PLATFORM' }, order: { createdAt: 'ASC' } });
    // `deletedAt` isn't auto-filtered here (no TypeORM soft-delete machinery, see
    // the entity's own column comment) — excluded explicitly, same as everywhere
    // else in this codebase that queries `users` directly.
    const live = users.filter((u) => u.deletedAt === null);
    return Promise.all(live.map((u) => this.toResponse(u, actorId)));
  }

  async get(publicId: string, actorId: string): Promise<PlatformUserResponse> {
    return this.toResponse(await this.findOrFail(publicId), actorId);
  }

  async create(input: CreatePlatformUserRequest, actorId: string): Promise<PlatformUserResponse> {
    const emailNormalized = UserEntity.normalizeEmail(input.email);
    const existing = await this.dataSource.getRepository(UserEntity).findOne({ where: { emailNormalized } });
    if (existing) throw new ConflictError(`A user with email '${input.email}' already exists`);

    const passwordHash = await this.hasher.hash(input.password);

    const user = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(UserEntity, {
          tenantId: null,
          userType: 'PLATFORM',
          email: input.email,
          emailNormalized,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        }),
      );

      await this.grantRoles(manager, created.id, input.roleCodes, actorId);
      return created;
    });

    return this.toResponse(user, actorId);
  }

  async update(publicId: string, input: UpdatePlatformUserRequest, actorId: string): Promise<PlatformUserResponse> {
    const user = await this.findOrFail(publicId);

    await this.dataSource.transaction(async (manager) => {
      if (input.firstName !== undefined) user.firstName = input.firstName;
      if (input.lastName !== undefined) user.lastName = input.lastName;
      await manager.save(user);

      if (input.roleCodes !== undefined) {
        await manager.delete(UserRoleEntity, { userId: user.id });
        await this.grantRoles(manager, user.id, input.roleCodes, actorId);
      }
    });

    return this.toResponse(user, actorId);
  }

  async suspend(publicId: string, actorId: string): Promise<PlatformUserResponse> {
    const user = await this.findOrFail(publicId);
    if (user.id === actorId) throw new BusinessRuleError('You cannot suspend your own account');

    user.status = 'SUSPENDED';
    await this.dataSource.getRepository(UserEntity).save(user);
    await this.refreshTokens.revokeAllForUser(user.id, 'ADMIN_REVOKED');
    return this.toResponse(user, actorId);
  }

  async revokeAllSessions(publicId: string, actorId: string): Promise<{ revokedCount: number }> {
    const user = await this.findOrFail(publicId);
    const count = await this.refreshTokens.revokeAllForUser(user.id, 'ADMIN_REVOKED');
    return { revokedCount: count };
  }

  /** No dedicated `platform.user:reactivate` permission exists — this is gated
   * on `:update` at the controller, same as any other status change here. */
  async reactivate(publicId: string, actorId: string): Promise<PlatformUserResponse> {
    const user = await this.findOrFail(publicId);
    if (user.status !== 'SUSPENDED') {
      throw new BusinessRuleError(`Cannot reactivate a user in status ${user.status}`);
    }
    user.status = 'ACTIVE';
    await this.dataSource.getRepository(UserEntity).save(user);
    return this.toResponse(user, actorId);
  }

  async remove(publicId: string, actorId: string): Promise<void> {
    const user = await this.findOrFail(publicId);
    if (user.id === actorId) throw new BusinessRuleError('You cannot delete your own account');

    user.deletedAt = new Date();
    user.status = 'DEACTIVATED';
    await this.dataSource.getRepository(UserEntity).save(user);
    await this.refreshTokens.revokeAllForUser(user.id, 'ADMIN_REVOKED');
  }


  private async findOrFail(publicId: string): Promise<UserEntity> {
    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { publicId, userType: 'PLATFORM' } });
    if (!user || user.deletedAt) throw new NotFoundError('Platform user', publicId);
    return user;
  }

  private async grantRoles(
    manager: DataSource['manager'],
    userId: string,
    roleCodes: PlatformRoleCode[],
    grantedBy: string,
  ): Promise<void> {
    const roles = await manager.find(RoleEntity, {
      where: roleCodes.map((code) => ({ code, scope: 'PLATFORM' as const })),
    });
    const foundCodes = new Set(roles.map((r) => r.code));
    const missing = roleCodes.filter((code) => !foundCodes.has(code));
    if (missing.length > 0) throw new NotFoundError('Role', missing.join(', '));

    await manager.save(
      roles.map((role) =>
        manager.create(UserRoleEntity, { userId, roleId: role.id, storeId: null, grantedBy }),
      ),
    );
  }

  private async toResponse(user: UserEntity, actorId: string): Promise<PlatformUserResponse> {
    const userRoles = await this.dataSource
      .getRepository(UserRoleEntity)
      .find({ where: { userId: user.id }, relations: { role: true } });

    return {
      id: user.publicId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roles: userRoles.map((ur) => ur.role?.code).filter((code): code is PlatformRoleCode => Boolean(code)),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      isSelf: user.id === actorId,
    };
  }
}
