#!/usr/bin/env bash
#
# Generates fresh values for AUTH_SECRET and CRON_SECRET and prints them.
#
# It deliberately does NOT edit .env: that file is the only copy of the running
# configuration and a botched in-place edit is harder to undo than a paste.
#
# ⚠ PREREQUISITES
#   1. The /login redirect fix must already be deployed. If rotating
#      AUTH_SECRET invalidates the live session cookies, every user is bounced
#      between "/" and "/login" until they clear the cookie by hand.
#   2. It is NOT established whether rotating AUTH_SECRET invalidates the live
#      cookies of this particular setup — sessions resolve against a database
#      row, not a signed JWT, so the answer is not obvious and was never
#      verified. Test with a throwaway account before rotating for real:
#        a) log in as the test account, confirm it works;
#        b) rotate AUTH_SECRET and recreate the app container;
#        c) reload as the test account. Still signed in → cookies survive.
#           Bounced to /login → they do not, and everyone will have to log in
#           again (which is fine, as long as /login is reachable).
#
# Usage:
#   scripts/ops/rotate-secrets.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

# 32 raw bytes: the length `openssl rand -base64 32` produces and the minimum
# the env schema will require once the corresponding code fix lands.
AUTH_SECRET_NEW="$(openssl rand -base64 32)"
CRON_SECRET_NEW="$(openssl rand -base64 32)"

echo "[SECRETS/ROTATE] New values — paste them into $ENV_FILE:"
echo
echo "AUTH_SECRET=$AUTH_SECRET_NEW"
echo "CRON_SECRET=$CRON_SECRET_NEW"
echo

if [ -f "$ENV_FILE" ]; then
  CURRENT_AUTH_LEN="$(grep -E '^AUTH_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | wc -c)"
  echo "[SECRETS/ROTATE] Current AUTH_SECRET length: $((CURRENT_AUTH_LEN - 1)) characters."
fi

cat <<'STEPS'

[SECRETS/ROTATE] Then, in order:
  1. cp .env .env.bak-$(date +%Y%m%d-%H%M%S)   # keep a way back
  2. edit .env with the two values above
  3. docker compose up -d --force-recreate app cron
       (recreate, not restart: the containers read .env at creation time)
  4. reload the app in a browser and confirm you can still reach /login
  5. confirm the cron sidecar still authenticates:
       docker compose logs --tail 50 cron
STEPS
