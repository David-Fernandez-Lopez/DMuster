#!/usr/bin/env bash
#
# Deletes rows from `sessions` whose `expires` is already in the past.
#
# Auth.js never prunes them: with a 30-day sliding window and the default
# 24h updateAge, a session used once a month is refreshed forever and every
# login adds a row without removing the previous ones.
#
# ⚠ PREREQUISITE: the /login redirect fix must already be deployed.
#    A user holding a cookie whose row is deleted here would otherwise be
#    bounced between "/" and "/login" forever, with no way back in short of
#    clearing the cookie by hand on their device.
#
# Usage:
#   scripts/ops/purge-expired-sessions.sh          # dry run: counts only
#   scripts/ops/purge-expired-sessions.sh --apply  # actually deletes

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-}"

cd "$REPO_ROOT"

if ! docker compose ps --status running --services | grep -qx db; then
  echo "[SESSIONS/PURGE] The 'db' service is not running." >&2
  exit 1
fi

echo "[SESSIONS/PURGE] Current state:"
docker compose exec -T db sh -c '
  MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root -B "$MYSQL_DATABASE" -e "
    SELECT
      COUNT(*)                                        AS total,
      SUM(expires <  NOW())                           AS expired,
      SUM(expires >= NOW())                           AS live,
      MIN(expires)                                    AS oldest_expiry
    FROM sessions;
  "
'

if [ "$MODE" != "--apply" ]; then
  echo
  echo "[SESSIONS/PURGE] Dry run. Re-run with --apply to delete the expired rows."
  exit 0
fi

echo "[SESSIONS/PURGE] Deleting expired rows ..."
docker compose exec -T db sh -c '
  MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root -B "$MYSQL_DATABASE" -e "
    DELETE FROM sessions WHERE expires < NOW();
    SELECT ROW_COUNT() AS deleted;
    SELECT COUNT(*) AS remaining FROM sessions;
  "
'

echo "[SESSIONS/PURGE] Done."
echo "[SESSIONS/PURGE] Note: this table has no index on \`expires\` (A10-05),"
echo "                 so a scheduled version of this purge needs one first."
