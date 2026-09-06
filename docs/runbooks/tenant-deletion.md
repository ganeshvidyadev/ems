# Runbook: Tenant deletion

## When to use
A merchant closes their account, or a compliance request requires permanent removal of a tenant's data ("right to erasure").

## Before you delete
1. **Run the data export runbook first** (`tenant-data-export.md`) unless the requester explicitly declined a copy — deletion is irreversible and a merchant who changes their mind five minutes later has no recourse otherwise.
2. Confirm there is no open marketplace relationship (`product_shares` where this tenant is either `supplier_tenant_id` or `reseller_tenant_id` with `status = 'ACTIVE'`) or unsettled `commission_ledger` balance (`settlement_id IS NULL`) — deleting a tenant mid-settlement orphans the other side's ledger. Resolve or force-settle those first.
3. Confirm no `subscriptions` row is `ACTIVE` with a pending invoice — cancel the subscription through the normal flow (`SubscriptionService.cancel`) so `subscription.cancelled` fires and any billing side effects (proration, final invoice) happen correctly, rather than deleting out from under active billing state.

## Known gap
There is no dedicated "delete tenant" endpoint or service in this codebase yet (`platform.tenant:delete` is a seeded permission with no implementing controller — the same gap `platform.tenant:export` had until Phase 12 added the export endpoint). Until one exists:

1. This is a **manual, DBA-executed** deletion, not an API call.
2. Because every tenant-scoped table's foreign keys reference `tenants(id)` with `ON DELETE CASCADE` (per the original migrations), a single `DELETE FROM tenants WHERE id = ?` *would* cascade-delete everything transitively — but this has never been executed or verified against this schema and must not be run against production without a rehearsal against a restored backup copy first (see `db-failover.md`).
3. `AuditLogEntity` is explicitly exempted from cascade (it's platform-global and "must survive tenant deletion for compliance" — its own doc comment) — confirm the audit trail for this tenant is preserved after any deletion, not silently dropped alongside everything else.

## Next step
Building a real `TenantDeletionService` (soft-suspend → grace period → hard delete with the same cascade-verification-against-a-restore discipline as any other destructive operation) is the natural next increment here, not a manual DBA runbook — flag it the same way `platform.tenant`'s missing CRUD controller is flagged elsewhere in this phase's notes.
