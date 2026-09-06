# Runbook: Queue backlog / outbox lag

## Symptom
- `OutboxLagCritical`/`OutboxLagWarning` alert firing (`ems_outbox_lag_seconds`).
- Merchants report actions that "don't seem to have happened" — an order placed with no confirmation email, a channel listing that never published — because the side effect is queued but not yet dispatched.

## Detection
- Grafana `EMS API — RED` → Outbox lag panel, or directly: `curl http://<api>/metrics | grep ems_outbox_lag_seconds`.
- `GET /api/platform/queues` for per-queue waiting/active/failed counts — this tells you *which* queue is actually backed up, since outbox lag alone doesn't (the relay could be healthy while one specific consumer, e.g. `report-generation`, is slow).

## Diagnosis
1. Is the **relay** behind, or a **consumer**?
   - Relay behind: `outbox_events` has a large `PENDING` backlog, but every queue's `waiting` count is low. Check `OutboxRelayService` is actually running (`EMS_ROLE=worker` process up, `queue.outboxRelayEnabled=true`) and MySQL isn't itself under load (the relay's own claim query is a simple indexed scan, but a saturated DB slows everything).
   - Consumer behind: one queue's `waiting`/`active` count is high while `outbox_events` itself is mostly `DISPATCHED`. Identify which processor (`ChannelSyncProcessor`, `NotificationProcessor`, etc.) and check its own error rate via `GET /api/platform/queues/<name>/failed`.
2. Check worker pod count/CPU — a consumer backlog under otherwise-normal per-job latency is usually just insufficient worker replicas for the current load, not a bug.

## Mitigation
1. **Consumer backlog, no failed jobs**: scale the worker Deployment (`kubectl scale deployment/ems-worker --replicas=N -n ems`) — safe, since every processor in this codebase is designed to run with N concurrent replicas.
2. **Consumer backlog, many failed jobs**: inspect `GET /api/platform/queues/<name>/failed` for the `failedReason`. If it's a transient upstream issue (a channel's API rate-limiting, an SMTP hiccup), let BullMQ's own backoff retry it — do not mass-retry via `/api/platform/queues/<name>/jobs/:id/retry` until the root cause is confirmed resolved, or you will re-trigger the same failure at volume.
3. **Relay itself stalled**: check the worker pod's own liveness/logs first (a crashed relay process is the most common cause) before assuming a MySQL problem.

## Resolution
- Confirm `ems_outbox_lag_seconds` back under 30s and holding.
- For any consumer that had failed jobs, replay them individually once root-caused: `POST /api/platform/queues/<name>/jobs/:id/retry`.

## Postmortem
- If the backlog caused a merchant-visible gap (e.g. no shipment-dispatched email for orders during the window), the fix already lands correctly for events dispatched *after* recovery — check whether any events landed in `DEAD` status (`outbox_events.status='DEAD'`) during the incident, since those need a manual reset to `PENDING` to ever be replayed at all.
