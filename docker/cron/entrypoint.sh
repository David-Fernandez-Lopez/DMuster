#!/bin/sh
set -eu

if [ -z "${CRON_SECRET:-}" ]; then
  echo "[cron] CRON_SECRET is unset - nothing to schedule."
  exec sleep infinity
fi

cat > /etc/crontabs/root <<EOF
*/15 * * * * wget -q -O- --post-data="" --header="x-cron-secret: ${CRON_SECRET}" http://app:3000/api/cron/calendar-sync
7 6 * * *    wget -q -O- --post-data="" --header="x-cron-secret: ${CRON_SECRET}" http://app:3000/api/cron/availability-reminders
EOF

exec crond -f -l 8
