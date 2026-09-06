# Runbook: Database failover / restore

## Two distinct scenarios
1. **RDS Multi-AZ automatic failover** (primary AZ has an issue) — AWS handles this automatically; this runbook's job is to *confirm* it happened cleanly and the app recovered, not to perform it.
2. **Restore from backup** (data corruption, an accidental destructive query, or a full region loss) — this is the scenario actually rehearsed below.

## Scenario 1: confirm automatic failover
1. `HighErrorRate` alert fires with a burst of `ECONNREFUSED`/`PROTOCOL_CONNECTION_LOST` in the error translation (`GlobalExceptionFilter.translateDatabaseError`'s own `SERVICE_UNAVAILABLE` branch) — this is the app-visible signature of an RDS failover in progress.
2. RDS failover typically completes in 60-120s. Confirm via `aws rds describe-db-instances` that `primary` is healthy again and `readiness` probes are passing.
3. No manual app-side action needed — the connection pool (`extra.connectTimeout`/`enableKeepAlive` in `data-source.ts`) reconnects on its own once RDS is back.

## Scenario 2: restore rehearsal (this is what to actually run periodically)
This exact procedure was rehearsed live during Phase 12 against a local MySQL 8.4 instance and timed at **13 seconds** for a small (32KB) dataset — production timing will differ with real data volume, but the procedure itself is verified correct end-to-end (backup → restore → row-count parity check), not just written.

1. **Backup**: `scripts/backup-mysql.sh` (env: `MYSQL_HOST`/`PORT`/`USER`/`PASSWORD`/`DATABASE`). Produces a gzipped `mysqldump` in `./backups/mysql/`.
2. **Restore into a separate database** (never the live one, for a rehearsal): `scripts/restore-mysql.sh <dump.sql.gz> <target-db>`. The script refuses to target `ems` directly unless `ALLOW_LIVE_RESTORE=yes` is explicitly set — that flag is for a genuine DR event, not a drill.
3. **Verify row-count parity** on a handful of representative tables between the live and restored databases (`tenants`, `users`, plus whichever table is most relevant to why you're restoring).
4. **Time it.** The Phase 12 exit criterion is a restore timed against a 1-hour RTO target — a rehearsal that isn't timed doesn't actually test that target.
5. Clean up the rehearsal database once verified (`DROP DATABASE <target-db>`) — don't leave it lying around as a stale, unmonitored copy of production data.

## Real production restore (not a rehearsal)
1. Confirm the actual RPO: with RDS automated backups, this is a point-in-time restore to a specific timestamp (`aws rds restore-db-instance-to-point-in-time`), not `scripts/restore-mysql.sh` against a manual dump — the manual dump path is for the docker-compose/local-dev deployment only (see `backup-mysql.sh`'s own comment on why `--source-data` binlog capture needs a privileged account this app's own user doesn't have).
2. Once the point-in-time-restored instance exists, re-point `MYSQL_HOST` (or `aws_db_instance.primary`'s Terraform state, if replacing the instance) and restart the API/worker Deployments.
3. Run the data-export runbook's own row-count-parity check pattern against the restored instance before cutting traffic over.

## MongoDB
`scripts/backup-mongo.sh`/`restore-mongo.sh` follow the same shape (`mongodump`/`mongorestore --gzip --archive`) but were **not** live-rehearsed in this environment — `mongodump`/`mongorestore` (the MongoDB Database Tools package) were not installed alongside the `MongoDB.Server` package this session's dev environment used. Rehearse these before relying on them; the scripts are correct-per-documentation, not verified end-to-end the way the MySQL pair is. Given docs/02 §20's own "nothing here is a source of truth" stance, a Mongo restore is lower-urgency than a MySQL one regardless.
