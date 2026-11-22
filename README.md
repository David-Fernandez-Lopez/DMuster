# DMuster

Web application for managing player availability across multiple tabletop RPG campaigns.

## What is DMuster?

Tabletop RPG groups often struggle to coordinate session dates across multiple campaigns and players with different schedules. DMuster replaces the typical "Google Sheets workaround" with a purpose-built tool.

Nobody proposes dates: every **eligible day** — every Friday, Saturday and Sunday, plus any
Monday–Thursday date a DM has marked as a holiday — is open for answers. Each player answers once
per day, and that answer applies to every campaign they belong to:

- **S** — Yes, I can make it
- **Sí (Online)** — Yes, but remotely
- **N** — No, I cannot make it
- **T** — Maybe / not sure yet

The app automatically computes a **viability result** per campaign for each eligible day, from
the answers of that campaign's members and the sessions already confirmed that day, in this
priority order:

| Result | Condition |
|--------|-----------|
| Slate-violet (B) | At least one member already plays another campaign's confirmed session that day |
| Red (N) | Otherwise, at least one member cannot attend |
| Amber (T) | Otherwise, at least one member answered *maybe* or has not answered yet |
| Blue (O) | Otherwise, everyone can play and at least one member plays online |
| Green (S) | Everyone can play in person |

Green and blue days are both viable: a DM can confirm a session on them directly.

By default every member counts. A DM can set **requirements for the campaign's next session**:
which players are required and/or a minimum number of players (DMs are always required and never
counted). Optional players then don't block a day on their own, and the requirements lapse by
themselves once that session has passed, so a forgotten setting never keeps a day green. Players
who come and go can instead be marked **always optional** on the campaign's players page, which
never expires.

## Features

- Monthly calendar view with color-coded session viability per campaign, plus every confirmed
  session in the group, including those of campaigns you are not in
- Role-based access: **DM** manages campaigns; **Players** set their own availability
- A user can be DM of some campaigns and player in others simultaneously
- Confirmed sessions: a DM confirms a session on a viable day (or forces one on a day that is
  not), adjusts who attends, and can cancel it; players who can play that day may join an
  already confirmed session themselves
- Flexible campaigns: per-campaign requirements for the next session (required players, minimum
  number of players) that reset on their own after that session, plus always-optional players
  for those who come and go
- Holidays: any DM can add extra Monday–Thursday dates that become eligible like a Friday or
  weekend
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
MySQL, Prisma and Auth.js sections; the rest are optional.

### Calendar feed (ICS)

Each user gets a personal subscription link from `/profile` ("Calendario" → "Generar enlace de
calendario"): `<AUTH_URL>/api/calendar/<token>.ics`. Add it once to Google Calendar ("Other
calendars" → "From URL"), Apple Calendar or Outlook, and their confirmed sessions show up there —
no account connection, no OAuth, nothing to renew. It needs no configuration beyond `AUTH_URL`
(the link is built from it, never from request headers) and `APP_TIMEZONE`.

What the feed contains, generated on every request from the database:

- Every active confirmed session the user attends, from the last 90 days onwards, with an
  "(Online)" suffix and a line naming who plays remotely when anyone does. Sessions with a start
  time become timed events (converted to UTC from `APP_TIMEZONE`, DST included); sessions without
  one are all-day events.
- The monthly reminder, "REVISAR CALENDARIO ROL" ("REVIEW RPG CALENDAR" for English users): an
  all-day event on the last day of the current month while *next* month still has an eligible day
  the user has not answered. It disappears from the feed once they finish answering.

Things worth knowing:

- **Refresh is up to the calendar app.** The feed asks clients to refresh hourly, but Google
  Calendar ignores that and re-reads subscriptions every 8–24 hours, so a newly confirmed session
  can take that long to appear there. Apple Calendar and Outlook refresh sooner.
- **The URL is the credential.** Anyone holding it can read that person's sessions. "Generar un
  enlace nuevo" in `/profile` replaces the token and kills the old URL at once; a disabled account's
  URL answers 404 too (see `scripts/ops/README.md`).
- **It must be reachable from the internet over HTTPS** for Google to fetch it, so a feed from a
  `localhost` install works in a local client but not in Google Calendar.

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
