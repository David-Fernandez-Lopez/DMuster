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
| `User` | id, name, email, password (hashed), role, locale, timestamps |
| `Campaign` | id, name, description, createdById, timestamps |
| `CampaignPlayer` | campaignId, userId *(M:N join table)* |
| `SessionDate` | id, date, createdById, timestamps |
| `Availability` | id, sessionDateId, userId, status (YES/NO/MAYBE), timestamps |

### Viability logic

For a given date and campaign, filter only the players belonging to that campaign, then apply in priority order:

1. Any player responds **N** → result **N**
2. Any player responds **T** or has not responded → result **T**
3. All players respond **S** → result **S**

## 4. Roles & Permissions

- **DM**: creates campaigns, manages players, proposes session dates
- **Player**: can only set their own availability
- A user may be DM of some campaigns and player in others
- Data model is designed to support multi-group in the future

## 5. UI

- Visual style: minimalist with RPG/fantasy touches (medieval-style headings, thematic icons, clean layout)
- **Mobile-first** responsive design (players respond primarily from mobile)
- Main view: monthly calendar with color-coded viability indicators per campaign per day
- Status colors: green (S — all confirmed), red (N — someone cannot), amber (T — pending/maybe)

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

**Campaigns** (9 total):
`academia`, `orden`, `cyberPunk`, `poulard`, `fishing`, `starWars`, `chicasMagicas`, `vampiro`, `verkko`
