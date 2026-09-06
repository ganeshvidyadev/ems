#!/usr/bin/env bash
# Restores a `backup-mysql.sh` dump into a target database — by default a
# *different* database name than the live one, so a rehearsal (per
# docs/runbooks/db-failover.md, and the Phase 12 exit criterion "restore
# rehearsed and timed against the 5 min RPO / 1 h RTO target") can never
# accidentally overwrite production data. Restoring over the live database
# for a genuine disaster-recovery restore is an explicit opt-in via
# `--target-is-live`, not the default.
set -euo pipefail

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-ems}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
MYSQL_BIN="${MYSQL_BIN:-mysql}"

DUMP_FILE="${1:?Usage: restore-mysql.sh <dump.sql.gz> [target-database]}"
TARGET_DB="${2:-ems_restore_rehearsal}"

if [[ "$TARGET_DB" == "ems" && "${ALLOW_LIVE_RESTORE:-}" != "yes" ]]; then
  echo "Refusing to restore over 'ems' directly — pass a different target database," >&2
  echo "or set ALLOW_LIVE_RESTORE=yes if this is a genuine DR restore, not a rehearsal." >&2
  exit 1
fi

started=$(date +%s)
echo "Restoring $DUMP_FILE into database '$TARGET_DB'..."

"$MYSQL_BIN" --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" \
  -e "CREATE DATABASE IF NOT EXISTS \`$TARGET_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

gunzip -c "$DUMP_FILE" | "$MYSQL_BIN" --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" "$TARGET_DB"

elapsed=$(( $(date +%s) - started ))
echo "Restore complete into '$TARGET_DB' in ${elapsed}s"
