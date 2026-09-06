#!/usr/bin/env bash
# Full logical backup of the MySQL primary. Paired with `restore-mysql.sh`
# and rehearsed against a real local database as part of Phase 12 (see
# docs/runbooks/db-failover.md) — a backup that has never been restored is a
# hope, not a backup.
#
# `--single-transaction` takes a consistent InnoDB snapshot without locking
# writers (READ-COMMITTED, matching `docker-compose.yml`'s own isolation
# setting) — the alternative, `--lock-tables`, would stall checkout for the
# whole dump duration.
#
# This snapshot alone is the RPO-24h fallback, not the 5-minute PITR target
# in docs/02 §22 — real PITR replays the binlog (already enabled via
# `--log-bin`/`ROW` format in both `docker-compose.yml` and
# `infra/terraform/rds.tf`) forward from this snapshot's position, which
# needs a backup account with `RELOAD`/`REPLICATION CLIENT` privilege to
# record (`--source-data=2`) — a privilege the regular `ems` app user
# deliberately doesn't have. In practice this runs as RDS's own automated
# snapshot + binlog retention (`aws_db_instance.primary`'s
# `backup_retention_period`), not this script — this script is the
# equivalent for the docker-compose/local-dev path, and is what
# `docs/runbooks/db-failover.md` actually rehearses against.
set -euo pipefail

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-ems}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
MYSQL_DATABASE="${MYSQL_DATABASE:-ems}"
OUT_DIR="${BACKUP_DIR:-./backups/mysql}"
MYSQLDUMP_BIN="${MYSQLDUMP_BIN:-mysqldump}"

mkdir -p "$OUT_DIR"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
out_file="$OUT_DIR/ems-${timestamp}.sql.gz"

echo "Backing up ${MYSQL_DATABASE}@${MYSQL_HOST}:${MYSQL_PORT} -> ${out_file}"

"$MYSQLDUMP_BIN" \
  --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" \
  --single-transaction --routines --triggers --events \
  --set-gtid-purged=OFF \
  --no-tablespaces \
  "$MYSQL_DATABASE" | gzip > "$out_file"

echo "Backup complete: $(du -h "$out_file" | cut -f1)"
echo "$out_file"
