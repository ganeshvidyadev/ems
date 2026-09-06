# Runbook: Canary rollback

## When this fires
`scripts/canary-rollout.mjs` (the `canary-prod` CI/CD job, `.github/workflows/ci.yml`) watches the RED metrics for a fixed window after a production deploy and exits non-zero if the error rate exceeds threshold — which fails that CI job and is the trigger for this runbook. This can also be invoked manually if an on-call engineer notices a problem the automated window missed (it only watches for a fixed duration; a slow-building issue can surface after the job has already reported success).

## Automated response (what the CI job already does)
1. Deploys the new image to a small percentage of production traffic (canary weight, applied via the ingress controller's canary annotations at deploy time — not a standing config in `ingress.yaml`).
2. Watches `http_requests_total`/`http_request_duration_seconds` for the configured window (`--window-seconds`, default 300s).
3. On failure, the CI job itself exits non-zero — **it does not automatically run `kubectl rollout undo`**. That is a deliberate choice: an automated rollback with no human confirmation, during what might be a genuine incident already in progress from an unrelated cause, is its own risk. The CI failure is the page; the rollback below is manual.

## Manual rollback procedure
1. Confirm the canary is genuinely the cause (not a coincidental unrelated incident — check whether the error signature correlates with the new image's own recent changes) via Sentry/error logs, same as `high-error-rate.md`.
2. `kubectl rollout undo deployment/ems-api -n ems` and `kubectl rollout undo deployment/ems-worker -n ems` if the worker image also shipped.
3. Remove the canary traffic-weight annotation/ingress split so 100% of traffic returns to the stable revision.
4. Confirm `ems_outbox_lag_seconds` and the RED panels return to baseline.
5. If the migration Job (`infra/k8s/migration-job.yaml`) already ran as part of this deploy and the new schema is *not* backward-compatible with the previous image version, a straight `rollout undo` is not safe — this is why every migration in this codebase is written to be additive/backward-compatible with the immediately-prior release (add columns/tables, never drop or rename in the same release that also depends on the new shape). Confirm this before undoing; if the migration genuinely isn't safely reversible, the fix is forward (patch and redeploy), not backward.

## Postmortem
- Note which metric crossed threshold and by how much — if the threshold itself was too tight (a false-positive canary failure), tune `--error-rate-threshold`/`--window-seconds` rather than the team learning to distrust and manually override canary failures going forward.
