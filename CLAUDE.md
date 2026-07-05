# DMuster — Project Context

## 1. What is DMuster

Web application for managing player availability across multiple tabletop RPG campaigns.
Replaces a manual Google Sheets workflow. Players respond to proposed session dates with one of three statuses — S (yes), N (no), T (maybe) — and the app computes a viability result per campaign for each date.

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
| `Campaign` | id, name, tag (2-letter chip label), description, createdById, timestamps |
| `CampaignPlayer` | campaignId, userId, role (DM/PLAYER) *(M:N join table)* |
| `Holiday` | id, date (unique), createdById, createdAt |
| `Availability` | id, date, userId, status (YES/NO), timestamps — unique per (date, user) |

Role is **per campaign**, stored on `CampaignPlayer.role`: the same user can be DM in one
campaign and player in another. `User` has no global role. `Campaign.createdById` records
the creator for audit purposes only; management rights come from holding the DM role in
that campaign (see §4). A campaign may have **several DMs**.

### Availability model

Nobody proposes specific session dates. Every **eligible day** is automatically respondable by
every player, and a player's response is **global per day** — a single YES/NO that applies to
**all** campaigns that player belongs to, not scoped to any campaign or proposed session.

Only `YES`/`NO` is ever stored in `Availability`. The third state **T** (pending / "maybe") is
**derived** from the *absence* of a response for a `(date, user)` pair — it is never persisted
and is never an option the player taps.

### Day eligibility

A day is eligible (playable / respondable) if it is a **Saturday**, a **Sunday**, or its date
is present in the `Holiday` table. Weekends are always eligible and are never stored; `Holiday`
only holds the extra weekday dates.

### Viability logic

For a given eligible day and campaign, filter only the players belonging to that campaign, then
apply in priority order:

1. Any player responds **N** → result **N**
2. Any player responds **T** (i.e. has no stored response) → result **T**
3. All players respond **S** → result **S**

## 4. Roles & Permissions

- Roles are **per campaign** (`CampaignPlayer.role`), not global. Any authenticated user can
  create a campaign and thereby becomes its **DM**.
- **DM** (of a given campaign): manages the campaign itself (edit/delete) and its players. DMs do **not** propose dates
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
- Only **eligible days** (weekends + holidays) are interactive; non-eligible days are dimmed and non-interactive
- Status colors: green (S — all confirmed), red (N — someone cannot), amber (T — pending/no response)
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

## 7. Reference Data (Seed)

Current group data — use as seed and for tests.

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

**Holidays** (extra weekday-eligible dates, seed): `2026-07-15`, `2026-08-06`.

**Availability**: the seed includes ~152 sample per-day responses (YES/NO) across Jul–Aug 2026,
on eligible days only. Absence of a response is "pending" (T) and is not stored.
