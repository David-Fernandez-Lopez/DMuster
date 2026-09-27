# DMuster

Web application for managing player availability across multiple tabletop RPG campaigns.

## What is DMuster?

Tabletop RPG groups often struggle to coordinate session dates across multiple campaigns and players with different schedules. DMuster replaces the typical "Google Sheets workaround" with a purpose-built tool.

Nobody proposes dates: every **eligible day** — every Saturday and Sunday, plus any weekday a DM
has marked as a holiday — is open for answers. Each player answers once per day, and that answer
applies to every campaign they belong to:

- **S** — Yes, I can make it
- **Sí (Online)** — Yes, but remotely
- **N** — No, I cannot make it
- **T** — Maybe / not sure yet

The app automatically computes a **viability result** per campaign for each eligible day, from
the answers of that campaign's members, in this priority order:

| Result | Condition |
|--------|-----------|
| Red (N) | At least one member cannot attend |
| Amber (T) | Otherwise, at least one member answered *maybe* or has not answered yet |
| Blue (O) | Otherwise, everyone can play and at least one member plays online |
| Green (S) | Everyone can play in person |

Green and blue days are both viable: a DM can confirm a session on them directly.

## Features

- Monthly calendar view with color-coded session viability per campaign
- Role-based access: **DM** manages campaigns; **Players** set their own availability
- A user can be DM of some campaigns and player in others simultaneously
- Confirmed sessions: a DM confirms a session on a viable day (or forces one on a day that is
  not), adjusts who attends, and can cancel it; players who can play that day may join an
  already confirmed session themselves
- Holidays: any DM can add extra weekday dates that become eligible like a weekend
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
| Framework | Next.js 16 (App Router, fullstack) |
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

Before opening it, generate the Prisma client, run the database migrations and create the first
account:

```bash
docker compose exec app npx prisma generate
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
```

The Prisma client is generated into `src/generated/`, which is gitignored and not built by the
development image, so a fresh clone has none until you run `prisma generate`. Both the app and
the seed import it. Run it again whenever `prisma/schema.prisma` changes.

> **Bootstrap:** there is no public sign-up (see *Features*) — creating an account requires an
> invitation, and sending one requires already being a DM of a campaign. On a fresh deployment
> the seed is what breaks that loop: it creates **one user as DM of one campaign**, taken from
> the `SEED_*` variables in `.env` (email, name, password, campaign name and tag). Log in as that
> user and invite the rest of the group from `/profile`. The seed refuses to run against a
> database that already has users or campaigns.

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
   > `refresh_token` **7 days** after it is issued in this mode, however much it is used; a user
   > seeing a "reconnect" prompt in `/profile` a week after connecting is expected, not a bug.
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
  and creates an all-day reminder event on the last day of the *current* month if so — titled
  "REVISAR CALENDARIO ROL", or "REVIEW RPG CALENDAR" for users with English as their language —
  clearing it again once they finish answering. Only affects users who both have Google
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
-- `trigger` is a reserved word in MySQL, so it must stay backquoted.
SELECT kind, action, `trigger`, success, googleEventId,
       CONVERT_TZ(executedAt, '+00:00', 'Europe/Madrid') AS executedLocal
  FROM calendar_event_logs ORDER BY executedAt DESC LIMIT 10;
```

Timestamps are stored in UTC. The `mysql` image loads the time zone tables, so a zone name
converts with daylight saving time taken into account.

`calendar_event_logs` only gains a row per real Google API call (insert/patch/delete) and is kept
indefinitely; `cron_runs` gains a row on every sweep tick (as often as every 15 minutes) and is
pruned after 90 days.

## Deployment

Production runs on [Coolify](https://coolify.io) from `docker-compose.prod.yml` (Build Pack:
Docker Compose); the file's header lists the variables it needs. Coolify builds the whole stack
from source, so a deploy is just "build this commit".

Every deploy starts a one-shot `migrate` service before the app. It applies pending migrations
and, while `SEED_USER_EMAIL` is set, also tries the bootstrap seed. The production image has no
Prisma CLI, so this is also how the first account gets created there: set the `SEED_*` variables
in Coolify for the first deploy, and remove them once that account exists. On later deploys the
seed refuses to run, logs why, and the app starts anyway.

### Releasing

Pushing a `v*` tag deploys it: `.github/workflows/deploy.yml` pins the Coolify application to the
tag's commit and triggers a deployment through the Coolify API. Creating the tag from a GitHub
release works the same way.

```bash
git tag v1.2.0
git push origin v1.2.0
```

One-time setup:

1. In Coolify, make sure the API is enabled (Settings → Advanced) and create an API token
   (Keys & Tokens → API tokens) with the `write` and `deploy` permissions.
2. In the application's settings, turn **Auto Deploy** off so pushes to `main` stop deploying
   on their own — tags become the only trigger.
3. In GitHub (Settings → Secrets and variables → Actions), add the repository **variables**
   `COOLIFY_BASE_URL` (e.g. `https://coolify.example.com`) and `COOLIFY_APP_UUID` (the last id in
   the application's Coolify URL), and the repository **secret** `COOLIFY_API_TOKEN`.

Notes:

- The Coolify instance must be reachable from GitHub-hosted runners, and the tagged commit must be
  on `main` (the branch Coolify clones).
- A green run means Coolify *accepted* the deployment, not that the build succeeded — follow it in
  Coolify's deployment log.
- The pinned commit sticks: a manual *Redeploy* in Coolify rebuilds the last released tag. To roll
  back, re-run an older tag's workflow run from the Actions tab.

## License

MIT
