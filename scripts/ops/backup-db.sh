#!/usr/bin/env bash
#
# Dumps the whole application database to a timestamped file.
#
# The dump runs *inside* the `db` container: the database has no published port
# (see docker-compose.yml), so it is only reachable from the compose network.
# Credentials are never passed on the host command line nor in mysqldump's argv
# — the container already holds them in its environment, and MYSQL_PWD carries
# the password so it never appears in `ps` output.
#
# A dump is the entire credential store in the clear — password hashes, session
# tokens (which are themselves the credential) and unencrypted Google OAuth
# tokens. So it is written OUTSIDE the repository by default: the repo tree is
# bind-mounted into the app container, which runs as root, and anything the
# application can reach is within reach of a compromise of the application.
# Files are created 0600 in a 0700 directory.
#
# Usage:
#   scripts/ops/backup-db.sh [output-directory]
#
# Default output directory: $DMUSTER_BACKUP_DIR, or ~/dmuster-backups.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${1:-${DMUSTER_BACKUP_DIR:-$HOME/dmuster-backups}}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/dmuster-$STAMP.sql.gz"

cd "$REPO_ROOT"

if ! docker compose ps --status running --services | grep -qx db; then
  echo "[BACKUP/DB] The 'db' service is not running. Start it with: docker compose up -d db" >&2
  exit 1
fi

# Owner-only from the moment the file is created: a chmod afterwards would
# leave a window in which the dump sits on disk world-readable.
umask 077
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

case "$(cd "$OUT_DIR" && pwd)/" in
  "$REPO_ROOT"/*)
    echo "[BACKUP/DB] ⚠ $OUT_DIR is inside the repository, which is bind-mounted"
    echo "            into the app container. The dump will be readable from"
    echo "            inside the running application. Prefer a path outside it."
    ;;
esac

echo "[BACKUP/DB] Dumping to $OUT_FILE ..."

# --single-transaction: consistent InnoDB snapshot without locking the tables.
# --quick: stream rows instead of buffering the whole result set in memory.
# Runs as root so routines, triggers and events are included regardless of the
# grants held by the application user.
docker compose exec -T db sh -c '
  MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump \
    -u root \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --events \
    "$MYSQL_DATABASE"
' | gzip > "$OUT_FILE"

# A dump that failed halfway still leaves a valid gzip stream, so verify the
# SQL itself carries mysqldump's completion marker before calling this a backup.
if ! gunzip -c "$OUT_FILE" | tail -5 | grep -q "Dump completed"; then
  echo "[BACKUP/DB] The dump is incomplete — removing $OUT_FILE" >&2
  rm -f "$OUT_FILE"
  exit 1
fi

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "[BACKUP/DB] Done: $OUT_FILE ($SIZE)"
echo "[BACKUP/DB] Restore with: scripts/ops/restore-db.sh $OUT_FILE"
echo "[BACKUP/DB] Treat this file as the credential store it is: it carries every"
echo "            password hash, every live session token and the Google OAuth"
echo "            tokens, all unencrypted."
