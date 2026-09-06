# Runbook: Redis queue memory pressure / eviction risk

## Why this is its own runbook
The queue Redis instance is configured `maxmemory-policy: noeviction` (both `docker-compose.yml` and `infra/terraform/elasticache.tf`) deliberately — BullMQ requires it, because `volatile-lru`/`allkeys-lru` would let Redis silently evict an acknowledged-but-not-yet-processed job under memory pressure, which is a **silent job loss**, not a visible error. The tradeoff is that under `noeviction`, a full instance rejects new writes outright (`OOM command not allowed`) instead of degrading gracefully — worse in the moment, but honest.

## Symptom
- New jobs fail to enqueue; `queue.add(...)` calls throw.
- `error_logs` show `OOM command not allowed when used memory > 'maxmemory'`.
- `OutboxRelayService.dispatch` starts failing its `queue.add()` calls specifically (visible as `outbox_events` rows cycling through retries with that error in `last_error`).

## Diagnosis
1. Check actual memory usage against the configured cap:
   ```
   redis-cli -h <redis-queue-host> INFO memory | grep used_memory_human
   ```
2. Identify which queue is holding the most data — usually a queue whose jobs carry large payloads (`REPORT_GENERATION`'s job data is small; the queue's actual growth is almost always retained **completed**/**failed** job history, not in-flight jobs) or a queue that's been backed up for a long time (see `queue-backlog.md` — an unresolved backlog is frequently the actual root cause here, not a genuine capacity problem).
3. Every queue in `QueueRegistry.onApplicationBootstrap` is configured with `removeOnComplete`/`removeOnFail` limits already — if memory is still growing unbounded, check whether a queue is missing from that configuration or whether the limits themselves need tightening for the actual load.

## Mitigation
1. **Short-term**: if a specific queue's backlog is confirmed safe to discard (e.g. a `notification` queue backed up with events for something no longer relevant), draining rather than growing the cap is safer than a capacity increase that just delays the same problem: `redis-cli -h <host> -n <db> FLUSHDB` **only** after confirming with the team this queue's pending work is genuinely disposable — this is destructive and queue-specific, never routine.
2. **Root cause is backlog, not genuine growth**: resolve via `queue-backlog.md` first; memory pressure here is usually a symptom of that, not an independent problem.
3. **Genuine capacity increase needed**: bump `redis_node_type`/the ElastiCache node size in `infra/terraform/elasticache.tf` and apply — this is infrastructure, not an emergency hotfix, and should go through the normal Terraform plan/apply/review cycle unless actively causing an outage.

## Resolution
- Confirm `used_memory` back under a comfortable margin (not right at the cap) and new jobs enqueue successfully again.

## Postmortem
- If this was caused by an unbounded backlog rather than genuine load growth, the real fix is whatever `queue-backlog.md`'s own postmortem identifies — this runbook's job is to keep Redis itself alive while that gets fixed, not to be the fix.
