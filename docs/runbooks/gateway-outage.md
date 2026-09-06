# Runbook: Payment gateway outage

## Symptom
- `checkout/orders`/`checkout/confirm-payment` error rate spikes (Grafana `EMS API — RED` → Errors panel).
- `PAYMENT_RECONCILE` queue depth climbing (`GET /api/platform/queues`).
- Customer reports of "payment failed" despite a valid card.

## Detection
- `HighErrorRate` alert firing scoped to `route=~"/api/v1/storefront/checkout.*"`.
- Gateway's own status page (Razorpay/Stripe/etc.) confirms an incident, **or** it doesn't — a silent gateway degradation (slow responses, not outright errors) is the harder case and shows up first as p95 latency on those routes, not error rate.

## Diagnosis
1. `GET /api/platform/queues` — check `payment-reconcile` and `order-lifecycle` depth/failed counts.
2. Check recent `payments` rows stuck in `INITIATED`/`AUTHORIZED` past a few minutes:
   ```sql
   SELECT id, gateway, status, created_at FROM payments
   WHERE status IN ('INITIATED','AUTHORIZED') AND created_at < NOW() - INTERVAL 10 MINUTE
   ORDER BY created_at LIMIT 50;
   ```
3. Check `error_logs` (Mongo) for the gateway adapter's own error class, via `GET /api/platform/logs/error_logs?limit=50`.

## Mitigation
1. If the current default gateway (`PAYMENT_GATEWAY_DEFAULT`) is confirmed down and a second gateway is configured for at least one tenant, that tenant can switch manually — there is no automatic multi-gateway failover in this codebase (each tenant has one configured gateway).
2. `OrderPaymentService.reconcilePending` (wired to a scheduled sweep) already resolves orders stuck `PENDING` once the gateway recovers — do not manually mark orders paid; let the reconciler converge once the gateway answers again. Manually confirming payment for an order the gateway never actually captured is how a merchant ships product with no money collected.
3. If checkout writes are themselves timing out (not just payment capture), consider a maintenance banner on the storefront rather than silently failing carts — this is a merchant/console-side action, not an API one.

## Resolution
- Once the gateway's own status page confirms recovery, re-run `reconcilePending` manually if the sweep interval is too slow to have caught up: `POST /api/v1/console/payments/reconcile`.
- Confirm `payment-reconcile` queue depth has drained back to baseline.

## Postmortem
- Note the outage window and cross-reference `payments` rows created in that window against the gateway's own settlement report once available — this is the reconciliation check that catches a payment the gateway actually captured but this system never recorded.
