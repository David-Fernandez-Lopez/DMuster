---
name: conventional-commits
description: >-
  Generate commit messages following the Conventional Commits specification by
  analyzing staged (or unstaged) git diffs. Use when the user asks to commit,
  write a commit message, review changes to commit, or says "/cc",  "conventional commit",
  "mensaje de commit", or "qué cambié".
---

# Conventional Commits

Generate well-structured commit messages by inspecting actual changes before proposing anything.

## Workflow

### 1. Inspect changes

Run `git diff --staged` first. If the output is empty, fall back to `git diff`.
If both are empty, inform the user there are no changes to commit.

Also run `git status --short` to get a quick overview of affected files.

### 2. Analyze scope

Review the diff output and determine:

- **Type** of change (see valid types below).
- **Scope** — the module, component, or area affected (optional but preferred).
- **Whether changes are related** — if the staged files touch multiple unrelated areas,
  suggest splitting into separate commits rather than forcing a single message.

### 3. Compose the message

Use this format:

```
type(scope): short imperative description

optional body explaining WHY the change was made

optional footer(s)
```

**Rules:**
- Subject line: imperative mood, lowercase, no period at the end, max ~72 chars.
- Body: wrap at 72 chars, explain motivation and contrast with previous behavior.
- Add body only when the change is non-trivial and the "why" isn't obvious from the subject.
- Add `BREAKING CHANGE: description` in the footer when the change introduces incompatibilities
  (public API changes, removed endpoints, schema migrations, config format changes, etc.).
- Append `!` after the type/scope for breaking changes: `feat(api)!: remove v1 endpoints`.

### 4. Valid types

| Type | Use when… |
|------|-----------|
| `feat` | Adding new functionality |
| `fix` | Fixing a bug |
| `docs` | Documentation only |
| `style` | Formatting, whitespace, semicolons (no logic change) |
| `refactor` | Code restructuring without changing behavior |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or dependencies |
| `ci` | CI/CD configuration |
| `chore` | Maintenance tasks (configs, tooling) |
| `revert` | Reverting a previous commit |

### 5. Examples

**Simple change:**
```
fix(auth): prevent session expiry on token refresh
```

**With body:**
```
feat(calendar): add monthly navigation arrows

Allow users to move between months without resetting filters.
Previously the only way to change month was through the date picker.
```

**Breaking change:**
```
feat(api)!: require authentication on availability endpoints

BREAKING CHANGE: GET /api/availability now requires a valid session.
Unauthenticated requests return 401 instead of public data.
```

**Multiple unrelated changes detected:**
> The staged changes modify both `src/components/Calendar.tsx` (UI layout)
> and `prisma/schema.prisma` (new model). These are unrelated — consider
> splitting into two commits:
> 1. `feat(db): add Notification model`
> 2. `style(calendar): adjust grid spacing on mobile`

### 6. Confirm with the user

After presenting the proposed message(s), ask the user:

- **Execute the commit** — run `git commit -m "..."` directly.
- **Just show the message** — copy-ready, no execution.

Use the `AskQuestion` tool for this choice when available.
