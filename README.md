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

`POST /api/cron/calendar-sync` retries failed Google Calendar syncs on a schedule, for when no
one has used the app recently to trigger the normal post-action sync. Leave `CRON_SECRET` unset
to disable the route (404) — manual retry from `/profile` works without it. When set, schedule a
periodic `POST` to that path with an `x-cron-secret` header matching its value.

A `cron` service is already wired into `docker-compose.yml` (`docker/cron/entrypoint.sh`,
Alpine's `crond`) that calls the route every 15 minutes over the compose network — no external
scheduler needed for local/self-hosted use. Set `CRON_SECRET` in `.env`
(`openssl rand -base64 32`, same recipe as `AUTH_SECRET`) and recreate the containers
(`docker compose up -d`) so both `app` and `cron` pick it up. Leaving it unset keeps the `cron`
service running but idle (it just sleeps — see the entrypoint script).

For a hosted deployment with its own scheduler (Vercel Cron, a scheduled GitHub Action, a cloud
provider's Cloud Scheduler, …), point it at the same route with the same header instead of
relying on the compose sidecar.

## License

MIT
