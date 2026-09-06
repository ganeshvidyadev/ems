# Runbook: Sales channel sync failure

## Symptom
- A merchant reports a connected channel (eBay, or a configured stub) shows stale inventory, missing orders, or a `channel.token_expired`/`ERROR` status.
- `channel-sync` queue's failed-job count rising (`GET /api/platform/queues/channel-sync/failed`).

## Diagnosis
1. Check the channel's own status: `GET /api/v1/console/channels/:id` → `status`, `lastError`, `tokenExpiresAt`.
2. `TOKEN_EXPIRED`: `ChannelSyncProcessor`'s own token-expiry sweep should have already caught this proactively (every 6 hours, 30-day lookahead) and fired a `channel.token_expired` notification — check whether that notification actually landed (`GET /api/v1/console/notifications`) for the tenant owner. If the sweep itself is failing, check the worker's own logs for `scan-token-expiry` job errors.
3. `status = 'ERROR'` with a specific `lastError`: this is almost always the marketplace's own API rejecting a request — rate limiting, an expired app-review grant, or a changed API contract on their end. Check `third_party_logs` (Mongo) for the raw response body from that call.
4. Orders not importing: check the `channel-order-import-scan` job's own cadence (every 15 minutes) is actually running, and whether `findAllConnectedWithAutoImport()` still includes this channel (auto-import may have been disabled, deliberately or by a prior error).

## Mitigation
1. **Expired/revoked OAuth token**: the merchant must re-authorize through the normal connect flow (`POST /api/v1/console/channels/:id/refresh-token` attempts a proactive refresh first; if the refresh token itself is invalid, this requires the merchant to reconnect via `POST /api/v1/console/channels`, generating a fresh OAuth authorize URL).
2. **Marketplace API rejecting requests (rate limit)**: this resolves itself once the marketplace's own limit window passes — do not retry aggressively, which extends the penalty window on most marketplace APIs. Manually triggering `POST /api/v1/console/channels/:id/sync-inventory` repeatedly during an active rate-limit is counterproductive.
3. **Genuine contract change on the marketplace's side** (their API shape changed): this is a code fix in the specific adapter (`EbayChannelAdapter` for eBay), not an operational mitigation — file it as a bug, not a runbook step.

## Resolution
- Confirm the channel's `status` returns to `CONNECTED` and a manual `sync-inventory`/`import-orders` call succeeds.

## Postmortem
- If this was a token-expiry the proactive sweep should have caught earlier, check why the sweep's own notification didn't reach the merchant in time (see `notification.processor.ts`'s `channel.token_expired` handling) — the sweep existing is not the same as the merchant actually seeing the warning before the token actually expired.
