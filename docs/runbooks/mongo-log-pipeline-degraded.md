# Runbook: MongoDB logging pipeline degraded

## Symptom
- `LogBufferDropping` alert firing (`ems_log_buffer_dropped_total` increasing).
- Platform log explorer (`GET /api/platform/logs/:collection`) returns gaps or stale data.

## Why this alert is `severity: warning`, not `critical`
Per docs/02 §20, "nothing here is a source of truth" — `LogBufferService` is explicitly fire-and-forget and designed to **drop and count** rather than block the request path or retry into an already-struggling database (see its own doc comment). A dropping log buffer is an observability-loss incident, never a customer-facing outage on its own. Do not treat it with the same urgency as `HighErrorRate`.

## Diagnosis
1. `curl http://<api>/metrics | grep ems_log_buffer` — check `ems_log_buffer_depth` (is the buffer actually filling up, or did something already flush and drain) alongside the dropped/failed-flush counters.
2. Check MongoDB's own health: is the DocumentDB cluster (or local `mongo` container) actually reachable and not itself under disk/CPU pressure?
3. Check `MONGO_LOG_FLUSH_INTERVAL_MS`/`MONGO_LOG_FLUSH_BATCH`/`MONGO_LOG_BUFFER_SIZE` config against current traffic volume — a buffer sized for a smaller fleet will show drops under genuine growth with no actual Mongo problem at all.

## Mitigation
1. **Mongo itself unhealthy**: this is a DocumentDB/infrastructure issue — check `aws_docdb_cluster`/`aws_docdb_cluster_instance` health in the AWS console (Terraform manages these, but doesn't monitor them at runtime) and consider a failover to the standby instance if the primary is the one struggling.
2. **Mongo healthy, buffer just undersized for current load**: increase `MONGO_LOG_BUFFER_SIZE`/`MONGO_LOG_FLUSH_BATCH` and redeploy — this is a config change, not an emergency.
3. **Sampling is already reducing volume** (`MONGO_LOG_SAMPLE_RATE_SUCCESS_GET`) — if drops persist even after a capacity increase, consider whether the sample rate itself needs lowering for successful high-volume read routes, trading detail for pipeline health.

## Resolution
- Confirm `ems_log_buffer_dropped_total`'s rate has returned to zero.

## Postmortem
- A drop during a genuine incident window (e.g. concurrent with `HighErrorRate`) means the incident's own log detail for that window is incomplete — note this explicitly in that incident's postmortem rather than assuming the log record is complete.
