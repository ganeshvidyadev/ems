#!/usr/bin/env bash
# Restores a `backup-mongo.sh` archive into a *different* database by
# default — same rehearsal-safety reasoning as `restore-mysql.sh`.
set -euo pipefail

MONGO_URI="${MONGO_URI:?MONGO_URI is required, pointed at the target database (e.g. .../ems_logs_restore_rehearsal)}"
MONGORESTORE_BIN="${MONGORESTORE_BIN:-mongorestore}"
ARCHIVE_FILE="${1:?Usage: restore-mongo.sh <archive.gz>}"

started=$(date +%s)
echo "Restoring $ARCHIVE_FILE into $MONGO_URI ..."

"$MONGORESTORE_BIN" --uri="$MONGO_URI" --gzip --archive="$ARCHIVE_FILE" --nsFrom='ems_logs.*' --nsTo='*'

elapsed=$(( $(date +%s) - started ))
echo "Restore complete in ${elapsed}s"
