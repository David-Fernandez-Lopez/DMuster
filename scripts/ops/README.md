# Operational scripts

Maintenance procedures that have no home in the application: things it cannot
do about itself (there is no password-change screen, no session management, no
backup routine) and things that belong to the deployment rather than the code.

Everything here runs against the **running compose stack**. The database has no
published port — `db` only resolves on the compose network — so no script talks
to MySQL from the host; they all go through `docker compose exec`.

All scripts default to a **dry run** or ask for confirmation. None of them
writes anything until explicitly told to.

## The scripts

| Script | What it does |
|---|---|
| `backup-db.sh` | Timestamped, gzipped `mysqldump` of the whole database into `~/dmuster-backups`. Verifies the dump completed before accepting it |
| `restore-db.sh` | Restores one of those dumps, after showing the row counts it is about to replace |
| `purge-expired-sessions.sh` | Deletes `sessions` rows whose `expires` is already past. Auth.js never prunes them |
| `rotate-secrets.sh` | Generates fresh `AUTH_SECRET` and `CRON_SECRET` values to paste into `.env` |
| `rotatePasswords.ts` | Gives every account a fresh random password with its own bcrypt salt |
| `disableAccount.ts` | Revokes (or restores) one account's access and ends its sessions |

## Order, and what depends on what

Run in this order. Steps 3–5 have a hard prerequisite spelled out below.

1. **Back up.** Nothing else should happen before there is a way back.

   ```bash
   scripts/ops/backup-db.sh
   ```

   Do this once with a restore too, against a throwaway database, so the dumps
   are known to be usable rather than merely present.

2. **Check the network exposure.** The database port is no longer published
   (`docker-compose.yml` has no `ports:` on `db`) — confirm that is still true,
   and that the port 3000 the app publishes is reachable only from where it
   should be:

   ```bash
   docker compose ps           # db must show no host port mapping
   ```

   The Windows firewall on the host is a separate matter and is not scriptable
   from here: re-enable it for the active profile, since it currently leaves
   the app open to the whole LAN.

3. **Give every account its own password.**

   ```bash
   docker compose exec app npx tsx scripts/ops/rotatePasswords.ts           # report
   docker compose exec app npx tsx scripts/ops/rotatePasswords.ts --apply   # rotate
   ```

   The script reports how many *distinct* password hashes exist before and
   after, which is the direct measure of the problem it solves.

4. **Rotate the secrets.**

   ```bash
   scripts/ops/rotate-secrets.sh
   ```

5. **Purge the stale sessions.**

   ```bash
   scripts/ops/purge-expired-sessions.sh           # counts
   scripts/ops/purge-expired-sessions.sh --apply   # delete
   ```

## Taking someone's access away

Not part of the sequence above — this is what to reach for when an account is
compromised, or when someone leaves.

```bash
docker compose exec app npx tsx scripts/ops/disableAccount.ts                              # who exists, and their session counts
docker compose exec app npx tsx scripts/ops/disableAccount.ts --email=a@b --apply          # revoke
docker compose exec app npx tsx scripts/ops/disableAccount.ts --email=a@b --enable --apply # restore
```

It sets `User.disabledAt` and deletes that user's sessions. Both halves are
needed: the flag stops new sign-ins, but a session already open is resolved from
its own row and never consults the user's state, so it would keep working.

**It does not delete the row, and cannot.** Six foreign keys reference a user
with `Restrict` — campaigns and holidays created, sessions confirmed and
cancelled, invitations sent and accepted — so anyone who has used the app is
undeletable. Deleting would also be the wrong thing: it cascades away their
`Account` row, leaving the Google token alive on Google's side with nothing
pointing at it, and their `CalendarEventLog` history, which is exactly the
record worth keeping when an account is suspect.

**It does not revoke their Google Calendar token.** DMuster can only do that
while the person is signed in and disconnecting from `/profile`. Once the
account is disabled, revoking it is theirs to do from their Google account
settings.

A person acting on their own account does not need any of this: `/profile` now
offers a password change and "close all sessions", both of which end every
session they hold.

### ⚠ Prerequisite for steps 3 (with `--end-sessions`), 4 and 5

**The `/login` redirect fix must be deployed first.**

Today the route proxy bounces anyone holding a session *cookie* away from
`/login` without checking whether the session still exists. Any operation that
invalidates live cookies therefore traps every user in a redirect loop between
`/` and `/login`, with no way back in short of clearing the cookie by hand on
each device.

### ⚠ Unverified: does rotating `AUTH_SECRET` invalidate live cookies?

Not established for this setup. Sessions resolve against a database row rather
than a signed JWT, so the answer is not obvious either way. `rotate-secrets.sh`
describes the test: rotate with a throwaway account logged in and see whether it
survives. Do that before rotating for real.

## Where the dumps go, and why not here

**A dump is the whole credential store**, in the clear: every password hash,
every live session token — which *is* the credential, no password needed — and
the Google OAuth tokens, which grant read/write access to the calendars of
whoever connected their account.

So `backup-db.sh` writes to `~/dmuster-backups` (override with
`$DMUSTER_BACKUP_DIR` or a first argument), owner-only, in a `0700` directory.
It deliberately does **not** write inside the repository:

- the repo tree is bind-mounted into the `app` container as `.:/app`, and that
  container runs as root, so a dump kept here would be reachable from a
  compromise of the application itself;
- the repository has a public remote, and `.gitignore` is a weak fence — one
  `git add -f`, one editor that indexes the folder, one copy of the project
  directory onto a USB stick, and the whole thing has left the building.

The script warns if you point it at a path inside the repository anyway.

## Is it safe to publish these scripts?

Yes. None of them contains a credential — passwords are read from the
containers' own environment and passed through `MYSQL_PWD` so they never reach
`argv`. And every one of them requires access to the Docker daemon, which is
already equivalent to root on the host: anyone who can run these could equally
`docker run -v /:/host` and read `.env` and the database volume directly.
`docker-compose.yml` already documents the same access path in a comment.

What must never be published is their **output**.
