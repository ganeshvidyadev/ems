# Runbook: Security incident / credential rotation

## When to use
A leaked credential, a suspected compromised account, an unexpected admin action in the audit log, or any event requiring an out-of-band credential rotation.

## Immediate containment
1. **Compromised platform-admin or tenant-owner account**: revoke every active session for that user. `RefreshTokenEntity` rows are the thing to invalidate — there is no single "kill all sessions" endpoint yet; this is a direct DB action:
   ```sql
   UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE user_id = ? AND revoked_at IS NULL;
   ```
   Force a password reset for the account before re-enabling it.
2. **Leaked JWT signing key**: this is the most severe case — every issued access token is signed with it and remains valid until its own (short, 10-minute) TTL expires, but a leaked *private* key lets an attacker forge new tokens indefinitely. Rotate immediately:
   - `pnpm run keys:generate` (or `scripts/generate-keys.mjs` directly) for a fresh RS256 pair.
   - Update `JWT_KEY_ID` to a new, non-`dev-`-prefixed value in the same change — `TokenService`/`JwksController` key rotation is keyed off `kid`, so a new key with the same `kid` as the compromised one would let the old (leaked) private key still verify against the published JWKS if anyone cached it.
   - Deploy the new Secret and restart the API/worker Deployments — every refresh token issued under the old key becomes unusable, which forces every user to log in again. This is the intended, correct blast radius for this scenario.
3. **Leaked encryption key** (`ENCRYPTION_KEY_BASE64`): this key decrypts stored channel OAuth tokens and ACME account keys (`CryptoService`). Rotating it requires re-encrypting every row that used it — `ChannelEntity`'s stored `access_token`/`refresh_token`, `AcmeAccountEntity`'s account key — which has no automated migration in this codebase yet. Treat as a genuine incident requiring a bespoke re-encryption script, not a routine rotation.
4. **Leaked third-party credential** (payment gateway secret, DNS provider token, channel API secret): rotate at the provider's own dashboard first (invalidates the leaked value immediately regardless of this platform's own state), then update the Kubernetes Secret and restart the affected Deployment.

## Investigation
1. `audit_logs` (platform-global, survives tenant deletion by design) is the first place to check for what an account actually did:
   ```sql
   SELECT * FROM audit_logs WHERE actor_id = ? ORDER BY created_at DESC LIMIT 200;
   ```
2. `auth_logs` (Mongo, via `GET /api/platform/logs/auth_logs`) for login/token-refresh patterns — an attacker's login typically comes from an unfamiliar IP/user-agent immediately preceding the suspicious activity.
3. `api_logs`/`error_logs` for the same actor/correlation-id window, to reconstruct exactly which endpoints were hit.

## Notification
- If tenant data was actually accessed (not just an attempted/failed access), this likely crosses into mandatory breach-notification territory depending on jurisdiction — escalate to whoever owns compliance before this runbook's technical remediation is considered "done."

## Postmortem
- Every credential rotated here should also get its rotation cadence documented going forward (an annual/quarterly schedule) — an incident-driven rotation with no standing policy just waits for the next leak.
