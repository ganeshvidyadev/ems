import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';
import { ThemeAccessService } from './theme-access.service';
import { themeAccessSchema } from './theme-access.controller';

describe('Company storefront theme access', () => {
  const context = new RequestContextService();
  const repo = { find: jest.fn(), findOne: jest.fn(), update: jest.fn() };
  const manager = { getRepository: () => repo } as unknown as EntityManager;
  const service = new ThemeAccessService(manager, context);
  const admin = (work: () => Promise<unknown>) =>
    context.run(
      RequestContextService.systemContext({
        userType: 'PLATFORM',
        roles: ['PLATFORM_SUPER_ADMIN'],
        surface: 'platform',
      }),
      work,
    );
  beforeEach(() => jest.resetAllMocks());

  it.each([
    { userType: 'TENANT' as const, roles: ['TENANT_OWNER'] },
    { userType: 'PLATFORM' as const, roles: ['PLATFORM_SUPPORT'] },
    { userType: 'TENANT' as const, roles: ['PLATFORM_SUPER_ADMIN'] },
  ])('rejects non-super-admin access: %j', async (identity) => {
    await expect(
      context.run(RequestContextService.systemContext(identity), () => service.list()),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      context.run(RequestContextService.systemContext(identity), () =>
        service.update('company', { selectedTheme: 'famms', allowedThemes: ['famms'] }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(repo.find).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('keeps Default allowed and only updates the requested company', async () => {
    repo.findOne.mockResolvedValue({ id: '42', status: 'ACTIVE', deletedAt: null });
    await admin(() =>
      service.update('northwind-public-id', {
        selectedTheme: 'organic',
        allowedThemes: ['organic'],
      }),
    );
    expect(repo.findOne).toHaveBeenCalledWith({ where: { publicId: 'northwind-public-id' } });
    expect(repo.update).toHaveBeenCalledWith('42', {
      storefrontTheme: 'organic',
      allowedStorefrontThemes: ['default', 'organic'],
    });
  });

  it('rejects a selected theme that is not allowed', async () => {
    repo.findOne.mockResolvedValue({ id: '42', status: 'ACTIVE' });
    await expect(
      admin(() =>
        service.update('company', { selectedTheme: 'famms', allowedThemes: ['organic'] }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects unknown themes even outside the controller', async () => {
    await expect(
      admin(() =>
        service.update('company', { selectedTheme: 'unknown', allowedThemes: ['unknown'] }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(
      themeAccessSchema.safeParse({ selectedTheme: 'unknown', allowedThemes: [] }).success,
    ).toBe(false);
  });

  it('resolves by the request tenant, never by a user-supplied slug', async () => {
    repo.findOne.mockResolvedValue({
      storefrontTheme: 'famms',
      allowedStorefrontThemes: ['default', 'famms'],
    });
    const value = await context.run(RequestContextService.systemContext({ tenantId: '99' }), () =>
      service.current(),
    );
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: '99' } });
    expect(value.selectedTheme).toBe('famms');
  });

  it('falls back to Default for revoked themes and new companies', async () => {
    for (const tenant of [
      { storefrontTheme: 'organic', allowedStorefrontThemes: ['default'] },
      { storefrontTheme: 'default', allowedStorefrontThemes: null },
    ]) {
      repo.findOne.mockResolvedValue(tenant);
      const value = await context.run(RequestContextService.systemContext({ tenantId: '1' }), () =>
        service.current(),
      );
      expect(value).toEqual({ selectedTheme: 'default', allowedThemes: ['default'] });
    }
  });

  it('requires tenant context for public reads', async () => {
    await expect(service.current()).rejects.toThrow();
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});
