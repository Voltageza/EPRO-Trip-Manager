#!/usr/bin/env bash
# Consistent SQLite backup + periodic uploads archive for the trip manager.
# Installed as /usr/local/bin/epro-trips-backup, run nightly by cron.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/epro-trips}"
DEST="${DEST:-/var/backups/epro-trips}"
DB_KEEP_DAYS="${DB_KEEP_DAYS:-14}"
UPLOADS_KEEP_DAYS="${UPLOADS_KEEP_DAYS:-60}"

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

# .backup is WAL-safe and can run while the service is live
sqlite3 "$DATA_DIR/trips.db" ".backup '$DEST/trips-$STAMP.db'"
gzip -f "$DEST/trips-$STAMP.db"

# job-card photos change rarely and are bulky - weekly is enough
if [ "$(date +%u)" = "7" ]; then
  tar czf "$DEST/uploads-$STAMP.tar.gz" -C "$DATA_DIR" uploads
fi

find "$DEST" -name 'trips-*.db.gz'    -mtime "+$DB_KEEP_DAYS"      -delete
find "$DEST" -name 'uploads-*.tar.gz' -mtime "+$UPLOADS_KEEP_DAYS" -delete

echo "$(date -Is)  backup ok -> trips-$STAMP.db.gz"
