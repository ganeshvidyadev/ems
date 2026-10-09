# EMS QA — Security Findings

Scope: safe, local, non-destructive checks against the running dev stack with the five demo accounts. No DoS/load, no brute force against shared accounts, no destructive exploitation. Evidence = executed tests in `qa/api/01,02,03,07` and `qa/e2e/*` (raw output in `qa-reports/raw/`).

## Headline

| Question | Answer | Evidence |
|---|---|---|
| Any confirmed cross-tenant data exposure (would be CRITICAL)? | **No.** 13 isolation tests + UI checks passed in both directions | TEN-001..012, SF-013, WF-008, CON-011, STO-008 |
| Any broken authentication / token forgery? | **No** (tampered JWT, `alg:none`, post-logout token all rejected) | AUTH-008/009/011 |
| Any broken authorization / IDOR? | **No** (404 on foreign ids for GET/PUT/DELETE/publish; session revoke IDOR blocked; mass assignment ignored) | TEN-003/004/005, SEC-008, SEC-011 |
| Any SQLi / stored-XSS execution? | **No** (login, filters, search, website content rendered as inert text) | SEC-004/005, SF-006, WEB-013, MKT-009 |
| Rate limiting present? | **No — High** | BUG-002 |

## Findings

| ID | Severity | Status | Finding | Evidence |
|---|---|---|---|---|
| SEC-F1 (BUG-002) | **High** | CONFIRMED | No HTTP rate limiting. 40 anonymous `gift-cards/check-balance` calls all succeeded (valid-code/balance oracle: `NW-GIFT-5000` => ₹5,000.00) and 12 failed logins for one unknown account were never throttled (401 each). Only nginx (not active locally) and the per-account lockout/OTP caps exist. `RATE_LIMIT_*` config is parsed but never consumed. | SEC-012, SEC-013 FAIL |
| SEC-F2 (BUG-005) | Medium | CONFIRMED | Tenant-resolution dev fallback: `Host: localhost` (or an unknown forwarded hostname when the API is reached via a dev host) resolves to the first ACTIVE tenant. Raw unknown Host is correctly rejected. Fallback is not gated by NODE_ENV. Impact is bounded (public storefront data of one tenant) but it defeats "unknown host => nothing". | TEN-011a PASS, TEN-011b FAIL, TEN-013 |
| SEC-F3 (BUG-009) | Low | CONFIRMED | Error message discloses internal class names (`Operation 'StoreEntity query' requires a tenant context`). | SEC-007 FAIL |
| SEC-F4 (BUG-008) | Low | CONFIRMED | Oversized request body => 500 with correlationId `unknown` (should be 413). Information-light but breaks the error contract and looks like a crash in monitoring. | API-005 FAIL |
| SEC-F5 | Low (dev-only) | OBSERVED | Swagger UI reachable unauthenticated on this dev instance (`/api/docs`); code disables it in production. `/metrics` is unauthenticated (and currently 500s, BUG-006); must be network-restricted in production. | SEC-010 INFO |
| SEC-F6 | Informational | VERIFIED | Passwords stored as bcrypt; refresh cookie `HttpOnly; SameSite=Strict` scoped to `/api/v1/auth`; access token TTL <= 15 min; logout denylists the token; JWKS exposes only public key material; CORS does not reflect hostile origins; `X-Content-Type-Options: nosniff`; no `X-Powered-By`. | AUTH-002/010/011/013, SEC-001/002/003/009, DB-010 |
| SEC-F7 | Informational | VERIFIED | Account enumeration resistant: same status/code/message for unknown vs real account on login and forgot-password. | AUTH-004, AUTH-015 |

## Suspected (code review only, not exercised — do not treat as confirmed)

- Admin-created tenants get the fixed documented demo password (platform-tenant.service.ts) — would be **High** if production code paths are used. (SUS-001)
- Suspended/cancelled tenants keep serving storefront + checkout because `TenantStatusGuard` skips `@Public()` routes. (SUS-003)
- Public enumerable endpoints besides gift cards (`storefront/reviews`, `storefront/auth/login`, `checkout/*`) are likewise unthrottled (follows from SEC-F1).
- `route-exposure.spec.ts` pins only ~21 of ~63 public routes, so a newly exposed public route would not fail CI. (SUS-008)
- CORS allows the `X-Tenant-Slug` header but nothing reads it (harmless).

## Not tested (and why)

- Account lockout (5 failures / 15 min): code-read only; triggering it would lock a shared demo account.
- Real payment-gateway webhook signature verification: unit specs exist (`payment-webhook-signatures`, 206 unit tests pass) but no live gateway/sandbox credentials; not claimed as integration proof.
- CSRF on cookie-authenticated endpoints, file-upload abuse (S3/MinIO not running), SSRF via channel/domain integrations, TLS/HSTS/CSP (these headers are production-only in `main.ts`; dev server cannot prove them).
