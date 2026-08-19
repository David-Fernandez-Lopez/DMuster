# DMuster

Web application for managing player availability across multiple tabletop RPG campaigns.

## What is DMuster?

Tabletop RPG groups often struggle to coordinate session dates across multiple campaigns and players with different schedules. DMuster replaces the typical "Google Sheets workaround" with a purpose-built tool.

Players respond to proposed session dates with one of three statuses:

- **S** — Yes, I can make it
- **N** — No, I cannot make it
- **T** — Maybe / not sure yet

The app automatically computes a **viability result** per campaign for each proposed date:

| Result | Condition |
|--------|-----------|
| Green (S) | All players confirmed |
| Red (N) | At least one player cannot attend |
| Amber (T) | At least one player is undecided or has not responded |

## Features

- Monthly calendar view with color-coded session viability per campaign
- Role-based access: **DM** manages campaigns; **Players** set their own availability
- A user can be DM of some campaigns and player in others simultaneously
- Multi-campaign support from a single account
- **Invitation-only access:** there is no public sign-up. A DM of any campaign sends a
  single-use, email-bound link (valid 7 days) from `/profile`, optionally pre-joining the
  invitee to one of their campaigns with a role; the recipient sets their name and password on
  the link to create the account
- Mobile-first responsive design
- Available in Spanish and English (i18n)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router, fullstack) |
| Database | MySQL / MariaDB + Prisma ORM |
| Auth | Auth.js v5 (credentials provider, database sessions) |
| Styles | Tailwind CSS |
| i18n | i18next + react-i18next |
| Deployment | Docker (docker-compose) |

## Getting Started

> Prerequisites: Docker and Docker Compose installed.

```bash
git clone git@github.com:David-Fernandez-Lopez/DMuster.git
cd DMuster
cp .env.example .env   # fill in your values
docker compose up
```

The app will be available at `http://localhost:3000`.

To run database migrations and seed reference data:

```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
```

> **Bootstrap warning:** there is no public sign-up (see *Features*) — creating an account
> requires an invitation, and sending one requires already being a DM of a campaign. On a
> **fresh deployment with an empty database, nobody can invite anyone yet.** The seed command
> above is what creates the first accounts (and their campaigns/DM roles); log in with one of
> the seeded users to send the first real invitation. There is no separate bootstrap script.

## Environment

Every variable is documented with comments in `.env.example`. Most deployments only need the
MySQL, Prisma and Auth.js sections; the two below are optional add-ons.

### Google Calendar sync (optional)

Lets users connect their Google account from `/profile` so confirmed sessions are mirrored to
their primary calendar. Leave `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
`GOOGLE_OAUTH_REDIRECT_URI` unset to skip this entirely — the app boots normally and `/profile`
hides the integration.

To set it up, in [Google Cloud Console](https://console.cloud.google.com):

1. Create a project and enable the **Google Calendar API** (APIs & Services → Library).
2. **OAuth consent screen** → User Type **External** → add the scope
   `https://www.googleapis.com/auth/calendar.events` under Scopes (search and add it manually —
   it is a sensitive scope and is not suggested by default; make sure it is saved) → add each
   player's email under **Test users**.
   > The app stays in **Testing** status — publishing to production would require Google's
   > verification review. Testing supports up to 100 test users, but Google expires each
   > `refresh_token` after **7 days** in this mode; a user seeing a "reconnect" prompt in
   > `/profile` after a week of inactivity is expected, not a bug.
3. **Credentials** → Create credentials → **OAuth client ID** → Web application. Add
   `<your-app-url>/api/integrations/google/callback` as an authorized redirect URI — it must
   match `GOOGLE_OAUTH_REDIRECT_URI` character-for-character.
4. Copy the Client ID and Client secret into `.env`, and recreate the app container
   (`docker compose up -d`) so it picks them up — `docker-compose.yml` only forwards variables
   it knows about at container creation time, not on every `.env` edit.

### Cron sweeper (optional)

Two routes, both authorized by the same `CRON_SECRET` shared-secret header (not a user session)
and both entirely inert (404) when it is unset:

- `POST /api/cron/calendar-sync` retries failed Google Calendar session syncs on a schedule, for
  when no one has used the app recently to trigger the normal post-action sync. Manual retry
  from `/profile` works without it.
- `POST /api/cron/availability-reminders` runs once a day: for every user with Google Calendar
  sync enabled, it checks whether *next* month still has an eligible day they have not answered
  and creates an all-day "REVISAR CALENDARIO ROL" event on the last day of the *current* month if
  so — clearing it again once they finish answering. Only affects users who both have Google
  connected and belong to at least one campaign.

A `cron` service is already wired into `docker-compose.yml` (`docker/cron/entrypoint.sh`,
Alpine's `crond`) that calls `calendar-sync` every 15 minutes and `availability-reminders` once a
day, both over the compose network — no external scheduler needed for local/self-hosted use. Set
`CRON_SECRET` in `.env` (`openssl rand -base64 32`, same recipe as `AUTH_SECRET`) and recreate the
containers (`docker compose up -d`) so both `app` and `cron` pick it up. Leaving it unset keeps
the `cron` service running but idle (it just sleeps — see the entrypoint script).

For a hosted deployment with its own scheduler (Vercel Cron, a scheduled GitHub Action, a cloud
provider's Cloud Scheduler, …), point it at the same routes with the same header instead of
relying on the compose sidecar.

### Sync audit logs

Every real write to the Google Calendar API and every cron execution is recorded for
troubleshooting — there is no admin screen for these, they are meant to be queried directly:

```sql
-- Recent cron executions, with duration and per-job details.
SELECT job, status, startedAt, finishedAt, durationMs, processed, failed, details
  FROM cron_runs ORDER BY startedAt DESC LIMIT 10;

-- Recent Google Calendar writes (converted to a local timezone for reading).
SELECT kind, action, trigger, success, googleEventId,
       CONVERT_TZ(executedAt, '+00:00', '+02:00') AS executedLocal
  FROM calendar_event_logs ORDER BY executedAt DESC LIMIT 10;
```

`calendar_event_logs` only gains a row per real Google API call (insert/patch/delete) and is kept
indefinitely; `cron_runs` gains a row on every sweep tick (as often as every 15 minutes) and is
pruned after 90 days.

## License

MIT
