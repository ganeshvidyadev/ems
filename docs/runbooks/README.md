# Runbooks

Each covers: symptom/detection, diagnosis, mitigation, resolution, postmortem note. Written to be executable by someone who did not write the code — the Phase 12 exit criterion is that every one of these gets run at least once by such a person, not just exist.

- [gateway-outage.md](gateway-outage.md) — payment gateway down or degraded
- [queue-backlog.md](queue-backlog.md) — outbox lag / a BullMQ queue backed up
- [tenant-data-export.md](tenant-data-export.md) — data-portability request
- [tenant-deletion.md](tenant-deletion.md) — account closure / right-to-erasure (documents a real gap: no automated deletion exists yet)
- [cert-renewal-failure.md](cert-renewal-failure.md) — a tenant custom domain's TLS cert failed to renew
- [db-failover.md](db-failover.md) — RDS failover confirmation, and the restore procedure (rehearsed live during Phase 12)
- [high-error-rate.md](high-error-rate.md) — general 5xx spike, the triage entry point
- [canary-rollback.md](canary-rollback.md) — a canary deploy failed its automated gate
- [security-incident.md](security-incident.md) — credential leak / compromised account / key rotation
- [redis-queue-oom.md](redis-queue-oom.md) — the BullMQ Redis instance under memory pressure
- [mongo-log-pipeline-degraded.md](mongo-log-pipeline-degraded.md) — the log/analytics pipeline dropping documents
- [channel-sync-failure.md](channel-sync-failure.md) — a connected sales channel stuck or erroring
