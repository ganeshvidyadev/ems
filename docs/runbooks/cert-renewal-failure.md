# Runbook: Certificate renewal failure

## Symptom
- `CertificateExpiringSoon`/`CertificateExpiryImminent` alert firing for a tenant custom domain.
- A merchant reports their custom domain shows a browser TLS warning.

## Detection
- Prometheus `probe_ssl_earliest_cert_expiry` (via the blackbox_exporter — see `infra/grafana/README.md`; not yet deployed in this environment) crossing the 14-day/3-day thresholds.
- `tenant_domains` rows where `ssl_status != 'ACTIVE'` or `ssl_expires_at` is approaching:
  ```sql
  SELECT hostname, ssl_status, ssl_expires_at FROM tenant_domains
  WHERE status = 'VERIFIED' AND ssl_expires_at < NOW() + INTERVAL 14 DAY;
  ```

## Diagnosis
1. Check `error_logs`/`third_party_logs` (Mongo, via `GET /api/platform/logs/error_logs`) for the domain's hostname around the renewal attempt — `AcmeService`'s renewal sweep logs the ACME directory's own error response verbatim.
2. Common causes, in order of likelihood:
   - **DNS-01 challenge TXT record failed to publish** — `CloudflareDnsAdapter` call failed (check `CLOUDFLARE_API_TOKEN` is still valid; a rotated/revoked token is the single most common cause of a fleet-wide renewal failure, as opposed to a single-domain one).
   - **The domain's own DNS was changed away from this platform** (the merchant repointed their CNAME/nameservers elsewhere) — a single-domain failure, not fleet-wide.
   - **Let's Encrypt rate limit** — check `ACME_DIRECTORY_URL`'s own status; five failures against the same FQDN in an hour triggers LE's own backoff, distinct from this platform's retry schedule.

## Mitigation
1. Fleet-wide (DNS provider auth issue): rotate `CLOUDFLARE_API_TOKEN` in the Secret (`infra/k8s/secret.yaml.example`'s key), restart the worker Deployment so it picks up the new value, and manually re-trigger the renewal sweep rather than waiting for the next scheduled pass.
2. Single-domain: verify DNS delegation is still correct (`dig TXT _acme-challenge.<hostname>` should eventually show the record once the sweep runs again) and confirm with the merchant whether they changed anything on their own DNS provider.
3. If a certificate has already expired: the domain fails closed (traffic to it is not served over HTTPS, or nginx's SNI has no matching cert and falls back to the wildcard default, showing a mismatched-certificate warning rather than the merchant's own domain — check nginx's own `ssl_certificate`/SNI config in `infra/nginx/conf.d/ems.conf`). Prioritize this domain's renewal above the sweep's normal ordering.

## Resolution
- Confirm `tenant_domains.ssl_status = 'ACTIVE'` and `ssl_expires_at` pushed out ~90 days.
- Confirm the alert has cleared.

## Postmortem
- If the cause was a Cloudflare token rotation, note the rotation cadence somewhere DevOps actually looks (this runbook, or the secret's own rotation policy) so the next scheduled rotation doesn't repeat the incident.
