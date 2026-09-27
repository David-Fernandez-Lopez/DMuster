#!/bin/sh
# Runs once per deploy, before the app starts (docker-compose.prod.yml makes
# `app` wait for this container to exit successfully).
set -eu

echo "[migrate] Applying pending migrations..."
npx prisma migrate deploy

# The seed only bootstraps an empty database and refuses to touch one that
# already has data (exit 1). That refusal is the normal state on every deploy
# after the first, so it must not block the app from starting: it is logged
# and ignored. Unset the SEED_* variables once the first account exists.
if [ -n "${SEED_USER_EMAIL:-}" ]; then
  echo "[migrate] SEED_USER_EMAIL is set - running the bootstrap seed..."
  npx prisma db seed || echo "[migrate] Seed did not run (see above). Expected if the database already has data."
fi

echo "[migrate] Done."
