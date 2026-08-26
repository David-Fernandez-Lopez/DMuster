#!/usr/bin/env bash
#
# Restores a dump produced by backup-db.sh, replacing the current database
# contents. A backup nobody has ever restored is not a backup, so this is the
# other half of the procedure — run it once against a throwaway database to
# prove the dumps are usable.
#
# Usage:
#   scripts/ops/restore-db.sh <dump.sql.gz> [--yes]
#
# Without --yes it prints what it is about to overwrite and asks to confirm.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DUMP_FILE="${1:-}"
CONFIRMED="${2:-}"

if [ -z "$DUMP_FILE" ]; then
  echo "Usage: scripts/ops/restore-db.sh <dump.sql.gz> [--yes]" >&2
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "[RESTORE/DB] No such dump: $DUMP_FILE" >&2
  exit 1
fi

cd "$REPO_ROOT"

if ! docker compose ps --status running --services | grep -qx db; then
  echo "[RESTORE/DB] The 'db' service is not running. Start it with: docker compose up -d db" >&2
  exit 1
fi

echo "[RESTORE/DB] About to REPLACE the contents of the running database with:"
echo "             $DUMP_FILE"
echo "[RESTORE/DB] Current row counts:"
docker compose exec -T db sh -c '
  MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root -N -B "$MYSQL_DATABASE" -e "
    SELECT CONCAT(\"  users: \", (SELECT COUNT(*) FROM users));
    SELECT CONCAT(\"  campaigns: \", (SELECT COUNT(*) FROM campaigns));
    SELECT CONCAT(\"  availabilities: \", (SELECT COUNT(*) FROM availabilities));
    SELECT CONCAT(\"  sessions: \", (SELECT COUNT(*) FROM sessions));
  "
' || echo "  (could not read row counts — the database may be empty)"

if [ "$CONFIRMED" != "--yes" ]; then
  printf "[RESTORE/DB] Type 'restore' to continue: "
  read -r answer
  if [ "$answer" != "restore" ]; then
    echo "[RESTORE/DB] Aborted."
    exit 1
  fi
fi

echo "[RESTORE/DB] Restoring ..."
gunzip -c "$DUMP_FILE" | docker compose exec -T db sh -c '
  MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root "$MYSQL_DATABASE"
'

echo "[RESTORE/DB] Done. Recreate the app container so it picks up a clean state:"
echo "             docker compose up -d --force-recreate app"
