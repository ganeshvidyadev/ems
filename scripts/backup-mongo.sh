#!/usr/bin/env bash
# Logical backup of the log/analytics database. Lower stakes than
# `backup-mysql.sh` — docs/02 §20 is explicit that nothing in Mongo is a
# source of truth — but still worth a retained snapshot for incident
# forensics (a security-incident runbook's first move is usually "what do
# the auth_logs from that window say").
set -euo pipefail

MONGO_URI="${MONGO_URI:?MONGO_URI is required}"
OUT_DIR="${BACKUP_DIR:-./backups/mongo}"
MONGODUMP_BIN="${MONGODUMP_BIN:-mongodump}"

mkdir -p "$OUT_DIR"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
out_dir="$OUT_DIR/ems-logs-${timestamp}"

echo "Backing up $MONGO_URI -> ${out_dir}.archive.gz"

"$MONGODUMP_BIN" --uri="$MONGO_URI" --gzip --archive="${out_dir}.archive.gz"

echo "Backup complete: $(du -h "${out_dir}.archive.gz" | cut -f1)"
echo "${out_dir}.archive.gz"
