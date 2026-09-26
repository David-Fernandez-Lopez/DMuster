#!/bin/sh
set -eu

if [ -z "${CRON_SECRET:-}" ]; then
  echo "[cron] CRON_SECRET is unset - nothing to schedule."
  exec sleep infinity
fi

# The secret is written to a file readable only by this user, and the crontab
# calls a wrapper that reads it at fire time. It used to be interpolated
# straight into the crontab lines, which put it in three places at once: on
# disk in /etc/crontabs/root, in the process table for the lifetime of every
# wget, and — because `crond -l 8` logs the command it runs to stdout — in the
# container's Docker log on the host, and in anything that log is shipped to.
#
# Belt and braces rather than a fix for a live hole: this container's process
# namespace is its own, so reading the table needs `docker exec` or root on the
# host. The log was the part that travelled.
umask 077
SECRET_FILE=/run/cron-secret
printf %s "$CRON_SECRET" > "$SECRET_FILE"

cat > /usr/local/bin/dmuster-cron <<'SCRIPT'
#!/bin/sh
# Builds the header at run time, so the secret never appears in argv.
set -eu
exec wget -q -O- --post-data="" \
  --header="x-cron-secret: $(cat /run/cron-secret)" \
  "http://app:3000/api/cron/$1"
SCRIPT
chmod 700 /usr/local/bin/dmuster-cron

cat > /etc/crontabs/root <<'EOF'
*/15 * * * * /usr/local/bin/dmuster-cron calendar-sync
7 6 * * *    /usr/local/bin/dmuster-cron availability-reminders
EOF

# -l 8 logged every command it ran. The commands no longer carry the secret,
# but there is nothing to gain from that verbosity either: level 6 keeps
# warnings and errors, which is what would need to be seen.
exec crond -f -l 6
