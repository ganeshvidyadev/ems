import { RequestContextService } from '../../common/services/request-context.service';

/**
 * Runs `work` with the ambient tenant context switched to `tenantId`.
 *
 * Needed anywhere a marketplace operation must write a row into a tenant
 * other than the one the request/job started in —
 * `TenantScopedRepository.create()` always stamps `tenant_id` from the
 * *active* context, not a value passed alongside it, so a genuine context
 * switch is the only way to write, say, a supplier's own sub-order from
 * code that started out scoped to the reseller. `RequestContextService`'s
 * own `runWithoutTenant` is the read-only twin of this, for cross-tenant
 * reads instead of a targeted write.
 */
export async function runAsTenant<T>(context: RequestContextService, tenantId: string, work: () => Promise<T>): Promise<T> {
  const current = context.get();
  return context.run(
    RequestContextService.systemContext({ correlationId: current?.correlationId, tenantId, causationId: current?.causationId }),
    work,
  );
}
