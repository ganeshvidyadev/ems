# Runbook: Tenant data export (data-portability request)

## When to use
A merchant (via support) or a legal/compliance request asks for a copy of everything a tenant's account owns — GDPR/DPDP-style data portability, not a routine report.

## Procedure
1. Confirm the requester's identity and authority to request this tenant's data (support-ticket verification is out of band from this system).
2. Get the tenant's public id: `SELECT public_id, business_name FROM tenants WHERE ...` (or from the platform console once that UI exists).
3. Trigger the export as a platform admin (`platform.tenant:export`):
   ```bash
   curl -X POST https://api.ems.example.com/api/v1/platform/tenants/<publicId>/export \
     -H "Authorization: Bearer <platform admin token>"
   ```
   Returns `{ jobId, status: "QUEUED" }`.
4. Poll the job: `GET /api/v1/console/jobs/<jobId>` until `status` is `COMPLETED` (or `FAILED`).
5. `outputUrl` on the completed job is a presigned S3 URL valid for 7 days, containing every row across the tables `TenantExportProcessor` covers (`apps/api/src/queues/processors/tenant-export.processor.ts` — `EXPORT_TABLES`, currently users/stores/products/orders/customers/subscriptions/support tickets and related child tables).
6. Deliver the URL to the requester through whatever channel the original request came in on — never paste it into a public or shared channel, since it grants read access to the whole export for its 7-day validity.

## Known gap
`EXPORT_TABLES` is not exhaustive of every `@TenantScoped()` table in the schema — join tables, internal ledgers (`commission_ledger`), and marketplace dual-tenant rows (`product_shares`) are not included. For a legally binding "complete" export, review that list against `apps/api/src/database/entities/index.ts`'s `ALL_ENTITIES` before delivering, and extend `EXPORT_TABLES` if a table the request specifically needs is missing.

## Escalation
If the export job repeatedly `FAILED`s, check `job_runs.error_message` for that job id — most likely cause is an S3/`StoragePort` connectivity issue, not the SQL export itself (each table query is a simple `WHERE tenant_id = ?` scan).
