import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RequestContextService } from '../../src/common/services/request-context.service';

describe('Storefront host authentication', () => {
  const context = new RequestContextService();
  const claims = { uid: '30', sub: 'customer-public', tid: '1', typ: 'storefront', userType: 'TENANT', jti: 'token' };
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new JwtAuthGuard(reflector as never,
    { verifyAccessToken: () => claims } as never, { isRevoked: async () => false } as never, context);

  function request(publicRoute: boolean) {
    reflector.getAllAndOverride.mockReturnValue(publicRoute);
    const req = { headers: { authorization: 'Bearer signed-token' }, user: undefined };
    const execution = { getType: () => 'http', getHandler: () => ({}), getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    return { req, execution };
  }

  it('accepts a customer on its own storefront', async () => {
    const { execution, req } = request(false);
    await context.run({ ...RequestContextService.systemContext({ tenantId: '1' }), surface: 'storefront' }, async () => {
      await expect(guard.canActivate(execution)).resolves.toBe(true);
      expect(context.get()?.customerId).toBe('30');
      expect(req.user).toBeDefined();
    });
  });

  it('rejects a foreign customer before attaching identity or changing the tenant', async () => {
    const { execution, req } = request(false);
    await context.run({ ...RequestContextService.systemContext({ tenantId: '2' }), surface: 'storefront' }, async () => {
      await expect(guard.canActivate(execution)).rejects.toThrow('Token does not belong');
      expect(context.tenantId).toBe('2');
      expect(context.get()?.customerId).toBeUndefined();
      expect(req.user).toBeUndefined();
    });
  });

  it('keeps public browsing anonymous on the requested host when a foreign token is supplied', async () => {
    const { execution, req } = request(true);
    await context.run({ ...RequestContextService.systemContext({ tenantId: '2' }), surface: 'storefront' }, async () => {
      await expect(guard.canActivate(execution)).resolves.toBe(true);
      expect(context.tenantId).toBe('2');
      expect(req.user).toBeUndefined();
    });
  });
});
