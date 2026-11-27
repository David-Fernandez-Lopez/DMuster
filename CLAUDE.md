# DMuster — Project Context

## 1. What is DMuster

Web application for managing player availability across multiple tabletop RPG campaigns.
Replaces a manual Google Sheets workflow. Players respond to proposed session dates with one of four statuses — S (yes), Sí (Online) (yes, remotely), N (no), T (maybe) — and the app computes a viability result per campaign for each date: S, O, N, T, or B ("Ocupado") when a member already plays another campaign's confirmed session that day. It also keeps the group's log of **critical successes and fumbles** ("críticos y pifias") per campaign and player, which used to live in an Excel.

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
| `User` | id, name, email, password (hashed), locale, availabilityHorizonMonths, timestamps |
| `Campaign` | id, name, tag (2-letter chip label), description, createdById, minPlayers, requirementsSetAt, archivedAt, colorSlot, systemId?, showDmRolls, timestamps |
| `CampaignPlayer` | campaignId, userId, role (DM/PLAYER), optional, alwaysOptional *(M:N join table)* |
| `Holiday` | id, date (unique), createdById, createdAt |
| `Availability` | id, date, userId, status (YES/NO/MAYBE/ONLINE), timestamps — unique per (date, user) |
| `CampaignArc` | id, campaignId, number, name? — unique per (campaignId, number) |
| `DiceEvent` | id, campaignId, userId (who rolled), kind (CRITICAL/FUMBLE), skillId, detail?, date, time?, arcId?, sessionId?, createdById, importKey? |
| `RoleSystem` | id, key, name, active — a tabletop system (Pathfinder 2e, Vampire…) |
| `SystemSkill` | id, systemId, key, category (SKILL/ATTRIBUTE/CONDITION), nameEs, nameEn, allowsDetail, requiresDetail, sortOrder, active — one closed-list entry of a system |

Role is **per campaign**, stored on `CampaignPlayer.role`: the same user can be DM in one
campaign and player in another. `User` has no global role. `Campaign.createdById` records
the creator for audit purposes only; management rights come from holding the DM role in
that campaign (see §4). A campaign may have **several DMs**.

### Critical and fumble log

A `DiceEvent` is one critical success or fumble a player rolled in a campaign. It is its **own event
with a date**, not a child of a session: it only optionally links to a `ConfirmedSession`
(`sessionId`, `SetNull`), because the imported history predates the app and cannot be matched to
sessions. The model records the bare facts (who, kind, skill, date, optional time) — there is no roll
value or note.

- **What was rolled is a closed list, per role system.** Each campaign has an optional `systemId`
  (`RoleSystem`, picked in "Editar campaña"/"Nueva campaña"); an event points at a `SystemSkill` of
  that system by `skillId`, never at free text. A `SystemSkill` is a **skill** ("Percepción"), an
  **attribute** ("Fuerza": a straight attribute check) or a **condition** ("Moribundo", `DYING`), told apart by
  `category`, so the statistics can ask "which skill gives me most criticals" (`category = SKILL`), "how many
  attribute checks" (`ATTRIBUTE`) and "how many times have I been dying" (`category = CONDITION AND key =
  'DYING'`) without one polluting the other. The form lists them in three groups. In the table both look the
  same: just the name, in the user's language (`nameEs`/`nameEn`).
- **Catalogues are data, loaded from files.** `prisma/catalog/<system>.json` (see `_template.json`) lists a
  system's entries; `prisma/syncCatalog.ts` (`npm run catalog:sync`, and on every deploy through
  `docker/migrate/entrypoint.sh`) upserts them idempotently. An entry that disappears from the file is
  only **deactivated** (it stops being offered but old events keep pointing at it). There is no screen to
  edit catalogues. Add a skill = edit the JSON and redeploy.
- **Detail.** An entry with `allowsDetail` (a Lore) takes a short free-text `detail` on the event
  ("Lore: GUILD"); nothing else does. Every system also has two **"Personalizado"** entries,
  `CUSTOM_SKILL` and `CUSTOM_CONDITION`, for rare or homebrew rolls: they have `requiresDetail`, so the
  text ("Fuerza") is mandatory (service error `detailRequired`). Two entries rather than one so that a
  homebrew condition is never counted as a skill.
- **A campaign without a system cannot log anything** (the form says to pick one first). The system
  **cannot be changed once the campaign has entries** (`campaigns.errors.systemLocked`), because they
  point at the old system's catalogue. The service, not the FK, checks that an event's entry belongs to
  the campaign's system and is active (an event may keep one that was deactivated later).
- **Date and time are stamped by the server** when an entry is logged (`nowStamp`, in `APP_TIMEZONE`):
  nobody types them, and any `date`/`time` sent on create is ignored. Editing an entry can correct
  both (the date still cannot be in the future). The time is the wall time of the roll and stays on
  the roll's own date: a roll at 00:21 is dated that day, not moved to the previous session's day.
- **Arcs** (`CampaignArc`) group a campaign's entries ("Arco 1"). Numbered automatically (highest + 1,
  under the campaign row lock), optionally named, managed by DMs in "Editar campaña". Deleting an arc
  keeps its entries without an arc (`SetNull`); the other arcs are not renumbered.
- **Validation:** the player must belong to the campaign, an edited date cannot be in the future (today is
  fine), and the arc and session, if given, must belong to the same campaign. Editing keeps the
  original `createdById` and never changes the campaign.
- **Visibility:** a member sees every entry of the campaigns they belong to, nothing else.
- **DMs' own rolls are opt-in, per campaign.** `Campaign.showDmRolls` (off by default; a checkbox in "Nueva campaña" and
  "Editar campaña") says whether the log shows the DMs' own entries. "DM" is the role **in that campaign**
  (`CampaignPlayer.role`), so the same person can be hidden as DM in one campaign and shown as a player in another. While it is off,
  DMs are left out of the table, the list, the filters and the form's player select, and the service refuses to log or edit an entry for
  one (`diceEvents.errors.dmHidden`). Entries that already exist are **kept** and come back if it is turned on. The statistics branch
  must respect this flag when it aggregates.
- **Provenance of imported entries.** `DiceEvent.originalText` (the text the Excel wrote) and
  `DiceEvent.note` (the preparer's remark, e.g. "supuesto error por SOCIEDAD") are filled only by the import
  and shown in the entry's dialog, so an entry can be reclassified later without the Excel. Editing in the app
  never touches them. Catalogue-level data not kept for now (an attribute per skill, groups, "has a value") can be
  added to the catalogue files later without touching any entry.
- **Import:** rows imported from the Excel carry `importKey` (`excel:<player>:<campaign>:<cell>`,
  unique), which makes re-running the import harmless. The mapping's `skills` section points Excel texts
  at catalogue **keys** (`"PERCEPCION": "PERCEPTION"`); `"LORE: GUILD"` splits into the Lore entry plus its
  detail (campaigns, players and `importedBy` may be given as ids, emails or names: an exact id wins), and a
  mapped value may carry an explicit detail (`"FUERZA": "CUSTOM_SKILL: FUERZA"`). Anything
  unmapped or missing from the system's catalogue blocks the import (a per-campaign `campaignSkills` section
  overrides `skills` where a text means something else in that campaign's system): odd texts become Personalizado only by
  an explicit mapping, never automatically, so a typo cannot hide there.
- **Statistics are out of scope here:** rankings, top skills and charts live in the separate
  statistics branch. This feature only provides the log, its CRUD and the import.

### Campaign colour

Each campaign has its own colour, stored as a **palette slot** (`Campaign.colorSlot`, an integer; the
slot maps to an OKLCH colour with light and dark variants in `src/lib/campaignColor.ts`). Slots 0–11 come from
a palette chosen by an optimiser, not by eye: the smallest distance between any two colours stays well
above the distinguishable threshold under normal vision **and** under protanopia, deuteranopia and
tritanopia (one player is colour-blind), and every colour keeps 3:1 contrast against the card background;
`campaignColor.test.ts` recomputes those guarantees. Slots from 12 up fall back to a generated colour
without that guarantee. A new
campaign gets the smallest slot no other campaign uses; a DM can change it in "Editar campaña", but
never to one another campaign holds (`campaigns.errors.colorTaken`; uniqueness is enforced by the
services, not the database, so it can become per-group later). The colour tints the campaign's tag
wherever it appears (`CampaignBadge`) and identifies it in the charts that compare campaigns. It never
travels alone — the tag or name is always next to it — and it is not used on the calendar cell, where
the dot's colour already means viability.

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
apply in priority order (this is the **default rule**, where every member is required; always-optional
players and a campaign's custom requirements refine it, see below):

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

By default every member of a campaign is required. Two settings relax that; DMs are always
required under both and never count towards a minimum:

- **Always-optional players** (`CampaignPlayer.alwaysOptional`), toggled per player on the
  campaign's players page: a player who comes and goes. It **never expires**. At least one player
  must stay required, so the toggle refuses to mark the last one.
- **Requirements for the next session**, set in "Editar campaña": which players are required (the
  rest become **optional**) and/or a **minimum number of players**. Always-optional players start
  unchecked there, but the DM can require one for that session.

Rules:

- **Who is optional on a day:** while the next-session requirements govern the day, what the DM
  chose for that session (`optional`); otherwise the standing `alwaysOptional`.
- **Viability:** the required members (every DM plus the non-optional players) go through the
  priority above; optional players never block on their own. With a minimum *M*, count the players
  (not DMs): *A* = `YES`/`ONLINE`, *P* = `MAYBE`/pending, *Z* = busy. The minimum is met if
  *A* ≥ *M*; otherwise it is **T** if *A*+*P* ≥ *M*, **B** if *A*+*P*+*Z* ≥ *M*, else **N**. The
  result is the stronger block of the two (B > N > T); when both pass, **O** if anyone who will
  play is online, else **S**. If every player ends up optional with no minimum (the last required
  player left), a minimum of 1 applies: the DM alone never makes a session.
- **Lifetime:** in force from the moment they are saved until the campaign's next confirmed session
  has passed — the first active session dated after the save, or on that same day but confirmed
  after it. They govern every day up to and including that session's date (every day while none
  is confirmed); later days use the default rule. Once that session is past they lapse on their
  own (ignored on read, no cleanup); a DM can also reset them earlier. This keeps a forgotten
  setting from painting days green. (Always-optional players are not affected: theirs is a
  standing fact, not a plan for one session.)
- **Confirming:** a viable confirmation signs up everyone who can play (`YES`/`ONLINE`, not busy)
  — the whole membership under the default rule. The others may self-join later.

### Archived campaigns and cancellation cause

- A DM can **archive** a concluded campaign (`Campaign.archivedAt`, from "Editar campaña"; it can be
  unarchived). Archiving is refused while the campaign has active sessions dated today or later. An
  archived campaign keeps its history for the statistics view, but takes no new sessions and drops
  out of the calendar's viability; it is listed under "Archivadas" in `/campaigns`.
- When a DM cancels a session they may name the member whose plans changed
  (`ConfirmedSession.cancelCauseUserId`, optional, must belong to the campaign). Statistics only.

## 4. Roles & Permissions

- Roles are **per campaign** (`CampaignPlayer.role`), not global. Any authenticated user can
  create a campaign and thereby becomes its **DM**.
- **DM** (of a given campaign): manages the campaign itself (edit/delete/archive), its players (including who is always optional) and its next-session requirements. DMs do **not** propose dates
- A campaign can have **multiple DMs** (several `CampaignPlayer` rows with role `DM`); each of them has full management rights over that campaign
- Campaign mutation permissions are checked against `CampaignPlayer.role = DM` **in that campaign**, never against `createdById` (audit only)
- **Player** (of a given campaign): can only set their own availability
- **Critical/fumble log**: **any member** of a campaign may add, edit and delete any entry of that campaign, for any member (a player's own or someone else's). Non-members get 404. Only the **arcs** are DM-only (create, rename, delete); any member can read them
- **Holidays**: any user who is DM of **at least one** campaign may add/remove holidays (extra weekday-eligible dates). There is no global admin role; this reuses the existing DM signal
- A user may be DM of some campaigns and player in others
- Data model is designed to support multi-group in the future

### Password recovery

Optional, enabled only when `SMTP_HOST` and `SMTP_FROM` are set (otherwise the login link is hidden
and `/forgot-password` / `/reset-password/*` return 404).

- `/forgot-password` takes an email. The answer is **always the same** neutral confirmation; the
  real outcome (`SENT`, `UNKNOWN_EMAIL`, `DISABLED_ACCOUNT`, `RATE_LIMITED`, `SEND_FAILED`) is only
  recorded in `PasswordResetLog` (email, outcome, IP, date; never a token).
- The mailed link (built from `AUTH_URL`, never from request headers) holds a single-use token,
  valid 60 minutes; only its SHA-256 hash is stored in `PasswordResetToken`. A new request voids
  older unused links.
- Rate limit, counted from the log: 3 requests per email and 10 per IP per hour (`RATE_LIMITED`
  rows do not count).
- Requests are processed after the response (`after()`), so the answer takes the same time
  whatever the address. The per-email limit is enforced under a MySQL `GET_LOCK`; the client IP is
  the last `X-Forwarded-For` entry (one proxy in front).
- Requesting a new link marks older unused ones `supersededAt`; redeeming one sets `usedAt`.
- Resetting the password also deletes all of the account's sessions.
- Retention: log rows are deleted after 90 days and tokens a day after expiring, pruned on each
  request (no cron needed).

## 5. UI

- Visual style: minimalist with RPG/fantasy touches (medieval-style headings, thematic icons, clean layout)
- **Mobile-first** responsive design (players respond primarily from mobile)
- Main view: monthly calendar with color-coded viability indicators per campaign per day
- Only **eligible days** (Fridays + weekends + holidays) are interactive; non-eligible days are dimmed and non-interactive
- Tapping an eligible day opens a **modal** to set the player's own Sí/Sí (Online)/Tal vez/No for that day (no page navigation); the per-campaign breakdown (#18) also lives in that modal. When a campaign has optional players that day (always optional, or per its session requirements), its card names the required players and the minimum, and marks optional players "Opcional" — visible to everyone
- "Mi disponibilidad" (`/availability`) lists upcoming eligible days to answer in a row, grouped by month. By default it shows at least 16 eligible days through the end of that month (about two months). Each user can widen it to 3, 4, 6 or 12 months (the current month included) with its "Mostrar" select, saved on their profile (`User.availabilityHorizonMonths`). The choice only adds days: the list never shows less than the default
- **Calendar feed**: `/profile` lets each user generate a personal iCalendar subscription URL (`/api/calendar/<token>.ics`) listing the active confirmed sessions they attend (last 90 days onwards) plus the monthly "REVISAR CALENDARIO ROL" reminder. Generated from the database on every request; the token (`User.calendarFeedToken`) can be regenerated, and a disabled account's feed answers 404. There is no Google Calendar integration
- Status colors: green (S — all needed confirmed), blue (O — all needed can play, someone online), red (N — someone needed cannot), amber (T — pending/no response), slate-violet (B — someone already plays another campaign's session)
- **Colour never travels alone**: every state carries an icon (`StatusIcon`: S tick, O screen, T question mark, N cross, B hourglass, unanswered dashed ring) next to its text or tag — calendar indicators, legend, pills, answer buttons, filters, warnings. The viability filter marks the active chips with a tick and the inactive ones with a dashed border
- **Colour-blind mode**: `/profile` has a "Modo daltónico" select (`User.colorVision`: off, `protan`, `deutan`, `tritan` or `all` = "I don't know"; per person, no cookie). The root layout stamps the value as `data-color-vision` and `globals.css` swaps in a full palette: the S/O/T/N/B tokens of that type (so each can use the part of the colour space that person tells apart) plus, common to every mode, muted ink, borders and the brand tint, a thicker ring for today and an outline on confirmed days. Values come from an optimiser over the Machado simulations; `colorVisionPalette.test.ts` parses the stylesheet and re-checks distances (under normal vision and the tuned one; `all` under the three) and WCAG contrast
- The calendar shows **every** active confirmed session of the group: the user's own campaigns' in bold with the cell tinted, other campaigns' as muted chips (no tint) plus a read-only "Otras partidas este día" section in the day modal, with name, time and players. A "Filtros" toggle hides the muted chips. Viability is still computed only for the user's own campaigns, and "Próximas partidas" (`/sessions`) lists only their own campaigns' sessions
- **Estadísticas** (`/statistics`): nav entry with three tabs — **Grupo** (everyone), **Mis campañas**
  (members only; a non-member gets a 404) and **Yo** — sharing a period selector kept in the URL
  (`?period=all|last12|<year>`). Metrics are pure functions in `src/lib/statistics/metrics.ts`
  (view-models carry numbers and keys, never text; wording lives in i18n); `statisticsService.ts` only
  loads data. A *played* session is an active one dated up to today; hours count only sessions with
  start time and duration; a day without an answer counts as `T`. Charts that compare campaigns (sessions per
  month, days between sessions, my sessions by campaign) and campaign chips use each campaign's own colour
  (`Campaign.colorSlot`), never an index computed from the creation order. A single campaign's sheet (`Mis campañas`) uses that
  campaign's colour in all its bars; the answer splits (S/O/T/N donuts) keep the state colours. Answer lead time uses
  `Availability.updatedAt`, so it is shown as approximate (≈). Spec: `design/design_handoff_estadisticas/`
- **Críticos y pifias**: `/rolls` shows every campaign the user belongs to, with filters by campaign, player, type and arc (kept in the URL); `/campaigns/[id]/rolls` is the same scoped to one campaign, reached from a "Críticos y pifias" button on each campaign card (there is no campaign detail page). A **Tabla | Lista** switch (`?vista=`) picks the view. The **table** (default) mirrors the Excel it replaces, in the statistics handoff's card style: one card per campaign, a column pair Crítico | Pifia per player with the totals up top, one row per entry (chronological), and one block per arc when the campaign has arcs. Column order is fixed, never by score: DMs first, then alphabetical; members with no entries keep a column. It loads the whole filtered log (no paging) so the totals are complete; narrow screens scroll it sideways. Each skill is a button opening a dialog with date, arc and author, plus Edit and Delete. The **list** is the paged, newest-first alternative. A modal form logs an entry (player defaults to the user, arc to the campaign's last; no date or time, they are automatic) or edits one. An empty log uses the handoff's dashed empty-state card. **Colour never travels alone**: each kind has an icon (star for a critical, bolt for a fumble) next to its name; and, following the handoff, the S/O/T/N state colours are **not** used for it (they are reserved for availability answers): a critical is a soft `brand` pill, a fumble a dashed outline pill and a hatched column header. Arcs are managed from "Editar campaña" (DMs)
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
