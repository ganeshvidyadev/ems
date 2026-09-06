# Runbook: High error rate (general)

## When to use
`HighErrorRate` fires (5xx rate > 2% for 5 minutes) with no route-specific pattern obvious yet — this is the "start here, then branch to a specific runbook" entry point. If the error is clearly checkout/payment-specific, go straight to `gateway-outage.md`; if it's clearly queue-related, `queue-backlog.md`.

## Diagnosis
1. Grafana `EMS API — RED` → Errors panel, split `by (route)` — is this one route or every route?
   - **One route**: a specific bug or dependency failure in that handler. Check `error_logs` (`GET /api/platform/logs/error_logs`) filtered to around the alert's start time for that route's stack traces.
   - **Every route**: a shared-dependency failure — MySQL, Redis, or a global interceptor/guard throwing. Check `/health/ready` directly; if it's failing too, this is an infra problem, not application code.
2. Sentry (if `SENTRY_DSN` is configured) groups these automatically by exception fingerprint — check for a single dominant issue rather than reading raw logs one at a time.
3. Correlate against the most recent deploy: `kubectl rollout history deployment/ems-api -n ems`. A spike starting within minutes of a rollout is almost always that rollout, not a coincidence.

## Mitigation
1. **Recent deploy correlated**: roll back immediately (`kubectl rollout undo deployment/ems-api -n ems`) — diagnose after traffic is healthy again, not before. This is exactly what `canary-rollback.md` automates for the canary stage; a full-fleet rollout that already promoted needs the same undo done manually.
2. **Shared dependency down** (MySQL/Redis unreachable): confirm via `/health/ready`'s own dependency checks, then follow `db-failover.md` if it's the database.
3. **Isolated route bug, no clear infra cause**: this is a genuine application bug — reproduce from the Sentry/error-log stack trace, patch, and ship through the normal CI/CD pipeline (not a hotfix bypass) unless actively bleeding revenue.

## Resolution
- Confirm the error rate panel back under 1% and holding for at least 15 minutes before considering this resolved.

## Postmortem
- Any rollback taken here should be followed by a proper root-cause fix and a **new** deploy through the full pipeline — a permanently-rolled-back main branch silently diverging from what's actually running in production is how the next deploy reintroduces the same bug.
