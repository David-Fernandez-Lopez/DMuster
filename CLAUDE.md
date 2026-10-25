# DMuster — Project Context

## 1. What is DMuster

Web application for managing player availability across multiple tabletop RPG campaigns.
Replaces a manual Google Sheets workflow. Players respond to proposed session dates with one of four statuses — S (yes), Sí (Online) (yes, remotely), N (no), T (maybe) — and the app computes a viability result per campaign for each date: S, O, N, T, or B ("Ocupado") when a member already plays another campaign's confirmed session that day.

## 2. Stack

- **Framework**: Next.js (App Router, fullstack)
- **Database**: MySQL/MariaDB + Prisma (ORM)
- **Auth**: Auth.js v5 with credentials provider, database sessions
- **Styles**: Tailwind CSS
- **i18n**: i18next + react-i18next (ES/EN, one JSON file per language)
- **Deployment**: Docker (docker-compose)

## 3. Data Model & Business Logic

### Entities

| Entity | Key fields |
|---|---|
| `User` | id, name, email, password (hashed), locale, timestamps |
| `Campaign` | id, name, tag (2-letter chip label), description, createdById, minPlayers, requirementsSetAt, timestamps |
| `CampaignPlayer` | campaignId, userId, role (DM/PLAYER), optional *(M:N join table)* |
| `Holiday` | id, date (unique), createdById, createdAt |
| `Availability` | id, date, userId, status (YES/NO/MAYBE/ONLINE), timestamps — unique per (date, user) |

Role is **per campaign**, stored on `CampaignPlayer.role`: the same user can be DM in one
campaign and player in another. `User` has no global role. `Campaign.createdById` records
the creator for audit purposes only; management rights come from holding the DM role in
that campaign (see §4). A campaign may have **several DMs**.

### Availability model

Nobody proposes specific session dates. Every **eligible day** is automatically respondable by
every player, and a player's response is **global per day** — a single Sí/Sí (Online)/Tal vez/No
that applies to **all** campaigns that player belongs to, not scoped to any campaign or proposed
session.

`YES`, `ONLINE` ("Sí (Online)" — can play, remotely), `NO` and `MAYBE` ("Tal vez") are all stored
in `Availability` — each is a real answer the player taps. Only the **pending** state stays *derived* from the *absence* of a response for a
`(date, user)` pair; clearing an answer deletes the row. For viability, the **T** tier covers both
a stored `MAYBE` and a missing response (see below).

### Day eligibility

A day is eligible (playable / respondable) if it is a **Friday**, a **Saturday**, a **Sunday**,
or its date is present in the `Holiday` table. Fridays and weekends are always eligible and are
never stored; `Holiday` only holds the extra Monday–Thursday dates.

### Viability logic

For a given eligible day and campaign, filter only the players belonging to that campaign, then
apply in priority order (this is the **default rule**, where every member is required; a campaign's
custom requirements refine it, see below):

1. Any player already **attends an active confirmed session of another campaign** that day → result **B** ("Ocupado")
2. Any player responds **N** → result **N**
3. Any player responds **T** (stored `MAYBE`, or no stored response) → result **T**
4. Any player responds **Sí (Online)** (the rest `YES`) → result **O**
5. All players respond **S** → result **S**

**B** follows the shared-attendee conflict rule: what counts is being an *attendee* of the other
session (a member left out of a forced session is free), DMs included, for the whole day. Being
busy overrides whatever the player answered.

**S** and **O** are both *viable*: a DM confirms either without forcing, and `ONLINE` counts as a
yes for the session rules (self-join, attendee preselection and warnings). **T**, **N** and **B**
are not viable: a DM can only force a session there, and busy players can never be picked.

### Session requirements

By default every member of a campaign is required. A DM can set **requirements for the next
session** in "Editar campaña": which players are required (the rest become **optional**) and/or a
**minimum number of players**. DMs are always required and never count towards the minimum.

- **Viability:** the required members (every DM plus the non-optional players) go through the
  priority above; optional players never block on their own. With a minimum *M*, count the players
  (not DMs): *A* = `YES`/`ONLINE`, *P* = `MAYBE`/pending, *Z* = busy. The minimum is met if
  *A* ≥ *M*; otherwise it is **T** if *A*+*P* ≥ *M*, **B** if *A*+*P*+*Z* ≥ *M*, else **N**. The
  result is the stronger block of the two (B > N > T); when both pass, **O** if anyone who will
  play is online, else **S**.
- **Lifetime:** in force from the moment they are saved until the campaign's next confirmed session
  has passed — the first active session dated after the save, or on that same day but confirmed
  after it. They govern every day up to and including that session's date (every day while none
  is confirmed); later days use the default rule. Once that session is past they lapse on their
  own (ignored on read, no cleanup); a DM can also reset them earlier. This keeps a forgotten
  setting from painting days green.
- **Confirming:** a viable confirmation signs up everyone who can play (`YES`/`ONLINE`, not busy)
  — the whole membership under the default rule. The others may self-join later.

## 4. Roles & Permissions

- Roles are **per campaign** (`CampaignPlayer.role`), not global. Any authenticated user can
  create a campaign and thereby becomes its **DM**.
- **DM** (of a given campaign): manages the campaign itself (edit/delete), its players and its next-session requirements. DMs do **not** propose dates
- A campaign can have **multiple DMs** (several `CampaignPlayer` rows with role `DM`); each of them has full management rights over that campaign
- Campaign mutation permissions are checked against `CampaignPlayer.role = DM` **in that campaign**, never against `createdById` (audit only)
- **Player** (of a given campaign): can only set their own availability
- **Holidays**: any user who is DM of **at least one** campaign may add/remove holidays (extra weekday-eligible dates). There is no global admin role; this reuses the existing DM signal
- A user may be DM of some campaigns and player in others
- Data model is designed to support multi-group in the future

## 5. UI

- Visual style: minimalist with RPG/fantasy touches (medieval-style headings, thematic icons, clean layout)
- **Mobile-first** responsive design (players respond primarily from mobile)
- Main view: monthly calendar with color-coded viability indicators per campaign per day
- Only **eligible days** (Fridays + weekends + holidays) are interactive; non-eligible days are dimmed and non-interactive
- Tapping an eligible day opens a **modal** to set the player's own Sí/Sí (Online)/Tal vez/No for that day (no page navigation); the per-campaign breakdown (#18) also lives in that modal. When a campaign's session requirements govern the day, its card names the required players and the minimum, and marks optional players "Opcional" — visible to everyone
- Status colors: green (S — all needed confirmed), blue (O — all needed can play, someone online), red (N — someone needed cannot), amber (T — pending/no response), slate-violet (B — someone already plays another campaign's session)
- The calendar shows **every** active confirmed session of the group: the user's own campaigns' in bold with the cell tinted, other campaigns' as muted chips (no tint) plus a read-only "Otras partidas este día" section in the day modal, with name, time and players. A "Filtros" toggle hides the muted chips. Viability is still computed only for the user's own campaigns, and "Próximas partidas" (`/sessions`) lists only their own campaigns' sessions
- **Design reference**: the authoritative visual spec lives in `design/README.md` and `design/screenshots/` (local, gitignored — a Claude design handoff). Follow it for layout, tokens, and flows

## 6. Conventions

### Language
All code, comments, and commit messages are written in **English**.

### Naming
| Target | Convention | Example |
|---|---|---|
| Variables / functions | `camelCase` | `getUserAvailability` |
| Components / classes / types | `PascalCase` | `CalendarView`, `UserRole` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_LOCALE` |
| Component files | `PascalCase.tsx` | `CalendarView.tsx` |
| Utility / service files | `camelCase.ts` | `campaignService.ts` |

### JSDoc
Every function with non-trivial logic must have a JSDoc block before it:

```typescript
/**
 * Converts a numeric column index to its corresponding spreadsheet-style
 * letter notation. Supports multi-letter columns (AA, AB...).
 * Example: 1 -> 'A', 28 -> 'AB'.
 *
 * @param {number} column - Numeric column index (1-based).
 * @returns {string} Letter(s) corresponding to the column.
 */
```

Format: one-line description → optional detail/examples → `@param` per argument → `@returns` → `@throws` if applicable.
Do not document trivial getters or constructors with no logic.

### Folder structure

```
src/
  app/          # Routes and pages (Next.js App Router)
  components/   # React components
  lib/          # Utilities and services
  types/        # TypeScript type definitions
  i18n/         # i18next config and locale files
    locales/
      es.json
      en.json
prisma/         # Schema and migrations
```

### API routes
- Follow REST conventions: `GET`, `POST`, `PUT`, `DELETE`
- Validate request bodies with **Zod** before processing
- Consistent response format: `{ data: ... }` on success, `{ error: "..." }` on failure
- Semantic HTTP status codes: 200, 201, 400, 401, 403, 404, 500
- Verify authentication and authorization at the top of every protected handler

### i18n
- Locale files: `src/i18n/locales/es.json` and `en.json`
- Keys use dot notation grouped by feature: `"calendar.title"`, `"campaign.createButton"`
- Never hardcode user-visible text in components — always use `t("key")`
- Default language: Spanish (`es`); users can change it in their profile
- When adding any new text, update **both** locale files simultaneously

### Commits
Follow **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `style:`, `test:`.
Messages must be concise, imperative, and lowercase.
Never do commits, theyu will always be done by the developer, only give the conventional commit.

### Error handling
- Use `try/catch` with descriptive messages that identify the origin and cause
- Log the full error (with stack) on the server with a `[MODULE/ACTION]` prefix
- Send only a safe, non-internal message to the client
- Never fail silently on the client — always show user feedback

### Environment variables
- `.env` — local secrets, listed in `.gitignore`, never committed
- `.env.example` — committed template with all keys and comments, no real values
- Validate all env vars with a Zod schema at app startup to fail fast on misconfiguration

## 7. Reference Data

Current group data — use for tests and as a mental model of the real group. It is **not**
seeded: `prisma/seed.ts` only bootstraps an empty database with one user as DM of one campaign,
all values read from the `SEED_*` env vars (no personal data in the repo). That user invites
everyone else from `/profile`.

**Players** and the campaigns they belong to (referenced by campaign key):

| Player | Campaigns |
|---|---|
| cgoob | academia, orden, cyberPunk, poulard, fishing, starWars, chicasMagicas, verkko |
| sergio | academia, orden, cyberPunk, vampiro, verkko |
| salgado | orden, cyberPunk |
| paola | academia, orden, cyberPunk, poulard, fishing, starWars, chicasMagicas, vampiro, verkko |
| tucho | academia, orden, poulard, fishing, starWars, chicasMagicas |
| david | academia, orden, cyberPunk, poulard, fishing, starWars, chicasMagicas, vampiro, verkko |
| adri | academia, orden, cyberPunk, poulard, fishing, starWars, chicasMagicas, vampiro, verkko |
| patri | academia, orden, cyberPunk, poulard, starWars, chicasMagicas, vampiro, verkko |
| ana | poulard, vampiro |

**Campaigns** (9 total) with their 2-letter `tag`:

| Key | Tag |  | Key | Tag |
|---|---|---|---|---|
| `academia` | AC |  | `starWars` | SW |
| `orden` | OR |  | `chicasMagicas` | CM |
| `cyberPunk` | CP |  | `vampiro` | VA |
| `poulard` | PO |  | `verkko` | VE |
| `fishing` | FI |  | | |

**Holidays** (extra weekday-eligible dates): `2026-07-15`, `2026-08-06`.
