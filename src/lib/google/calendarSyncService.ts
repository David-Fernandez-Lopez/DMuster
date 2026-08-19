// Drives the Google Calendar sync ledger (`SessionCalendarEvent`, roadmap
// #23): `enqueue*` functions are called by `confirmedSessionService.ts` right
// after a session mutation commits, and only ever write PENDING/FAILED rows —
// they never call Google themselves, so a confirmation can never fail because
// Google is unreachable. `processPending` is the only function that actually
// talks to Google, walking due rows and advancing them to SYNCED or DELETED
// (or leaving them FAILED for the next pass). It is invoked from the session
// API routes via `after()` (fire after the response is sent), by the manual
// "Reintentar" action, and by the optional cron sweeper — all roadmap #23
// phase 5.

import { after } from "next/server";

import { DEFAULT_LOCALE } from "@/i18n/settings";
import { toIsoDate, toUtcDate, todayIso } from "@/lib/date";
import { env } from "@/lib/env";
import {
  CalendarEventAction,
  CalendarEventKind,
  SyncOperation,
  SyncStatus,
  SyncTrigger,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

import { buildCalendarEvent } from "./calendarEvent";
import { logCalendarEvent } from "./calendarEventLog";
import { deleteEvent, insertEvent, patchEvent, type MutateEventResult } from "./calendarClient";
import { getAccessToken } from "./oauth";
import { isDueForRetry, MAX_SYNC_ATTEMPTS } from "./syncBackoff";

/** How many due rows `processPending` handles in one call by default. */
const DEFAULT_PROCESS_LIMIT = 25;

/** Sanity ceiling on candidate rows loaded before filtering by due-ness; this app's data volume never approaches it. */
const CANDIDATE_FETCH_CAP = 500;

type PendingSyncRow = {
  id: string;
  sessionId: string;
  userId: string;
  googleEventId: string | null;
  operation: SyncOperation;
  attempts: number;
  lastAttemptAt: Date | null;
};

type SessionSyncData = {
  campaignName: string;
  dateIso: string;
  startTime: string | null;
  durationMinutes: number | null;
  attendeeNames: string[];
};

/**
 * Loads the current attendee ids of a session — used by `enqueueForSession`
 * when called without an explicit list, the roadmap #21 whole-campaign-
 * confirms path where every member becomes an attendee in the same
 * transaction the ledger rows are queued right after.
 *
 * @param {string} sessionId - The session to look up.
 * @returns {Promise<string[]>} The attendees' user ids.
 */
async function loadAttendeeIds(sessionId: string): Promise<string[]> {
  const attendees = await prisma.confirmedSessionAttendee.findMany({
    where: { sessionId },
    select: { userId: true },
  });
  return attendees.map((attendee) => attendee.userId);
}

/**
 * Narrows a list of user ids down to those who have opted into Google
 * Calendar sync, so `enqueueForSession` never queues a row for someone who
 * never connected (or has paused) their calendar.
 *
 * @param {string[]} userIds - Candidate user ids.
 * @returns {Promise<string[]>} The subset with `googleSyncEnabled = true`.
 */
async function filterSyncEnabledUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) {
    return [];
  }
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, googleSyncEnabled: true },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/**
 * Upserts a PENDING/UPSERT sync row for each given attendee who has Google
 * Calendar sync enabled — called right after a session is confirmed (every
 * attendee) or after a single attendee is added (roadmap #22, one id).
 * Idempotent: resets a previously DELETED row's stale `googleEventId` back to
 * null (and `attempts` to 0), so a person removed and later re-added gets a
 * fresh `insertEvent` instead of `processPending` trying to PATCH an event
 * Google no longer has.
 *
 * @param {string} sessionId - The confirmed session to sync.
 * @param {string[]} [attendeeUserIds] - The attendees to (re)queue; defaults to every current attendee of the session.
 * @returns {Promise<void>}
 */
export async function enqueueForSession(sessionId: string, attendeeUserIds?: string[]): Promise<void> {
  const targetUserIds = attendeeUserIds ?? (await loadAttendeeIds(sessionId));
  if (targetUserIds.length === 0) {
    return;
  }

  const syncEnabledUserIds = await filterSyncEnabledUsers(targetUserIds);
  if (syncEnabledUserIds.length === 0) {
    return;
  }

  await Promise.all(
    syncEnabledUserIds.map((userId) =>
      prisma.sessionCalendarEvent.upsert({
        where: { sessionId_userId: { sessionId, userId } },
        create: { sessionId, userId, status: SyncStatus.PENDING, operation: SyncOperation.UPSERT },
        update: {
          status: SyncStatus.PENDING,
          operation: SyncOperation.UPSERT,
          attempts: 0,
          lastError: null,
          googleEventId: null,
        },
      }),
    ),
  );
}

/**
 * Flips a session's already-SYNCED rows back to PENDING/UPSERT after its
 * time or duration changed (`updateSession`), so the next `processPending`
 * PATCHes the existing Google event with the new schedule. Rows that are
 * PENDING or FAILED are left alone — they have not been created at Google
 * yet, so they will simply pick up the session's current data (loaded fresh,
 * not cached in the row) whenever they are next processed; DELETED rows are
 * left alone too, since that attendee no longer has an event to update.
 *
 * @param {string} sessionId - The session whose schedule changed.
 * @returns {Promise<void>}
 */
export async function enqueueUpdateForSession(sessionId: string): Promise<void> {
  await prisma.sessionCalendarEvent.updateMany({
    where: { sessionId, status: SyncStatus.SYNCED },
    data: { status: SyncStatus.PENDING, operation: SyncOperation.UPSERT, attempts: 0, lastError: null },
  });
}

/**
 * Marks a session's sync rows for deletion — used when a session is
 * cancelled (every attendee) or a single attendee is removed. A row that
 * never reached SYNCED (no `googleEventId` yet) has nothing to delete at
 * Google, so it is marked DELETED directly instead of round-tripping through
 * `processPending` for no reason; a row that does have an id is queued as a
 * PENDING/DELETE for `processPending` to actually call Google.
 *
 * @param {string} sessionId - The session being cancelled or losing an attendee.
 * @param {string} [userId] - A single attendee to remove; omitted means every attendee with a sync row for this session.
 * @returns {Promise<void>}
 */
export async function enqueueDeletion(sessionId: string, userId?: string): Promise<void> {
  const scope = userId ? { sessionId, userId } : { sessionId };
  const notAlreadyDeleted = { status: { not: SyncStatus.DELETED } };

  await prisma.sessionCalendarEvent.updateMany({
    where: { ...scope, ...notAlreadyDeleted, googleEventId: null },
    data: { status: SyncStatus.DELETED, operation: SyncOperation.DELETE },
  });

  await prisma.sessionCalendarEvent.updateMany({
    where: { ...scope, ...notAlreadyDeleted, googleEventId: { not: null } },
    data: { status: SyncStatus.PENDING, operation: SyncOperation.DELETE, attempts: 0, lastError: null },
  });
}

/**
 * Loads the ids of every active, future session a user attends — the shared
 * "what should this user's calendar reflect going forward" query used by
 * both `backfillForUser` and `enqueueDeletionForUser`. Mirrors
 * `listUpcomingSessions`'s query in `confirmedSessionService.ts`.
 *
 * @param {string} userId - The user to look up.
 * @returns {Promise<string[]>} Matching session ids.
 */
async function loadFutureActiveSessionIds(userId: string): Promise<string[]> {
  const sessions = await prisma.confirmedSession.findMany({
    where: {
      cancelledAt: null,
      date: { gte: toUtcDate(todayIso()) },
      attendees: { some: { userId } },
    },
    select: { id: true },
  });
  return sessions.map((session) => session.id);
}

/**
 * Enqueues every future active session a user attends — called when they
 * first enable sync or reconnect, so turning it on does not leave already-
 * confirmed sessions invisible in their calendar until something else about
 * them happens to change.
 *
 * @param {string} userId - The user who just enabled or reconnected sync.
 * @returns {Promise<void>}
 */
export async function backfillForUser(userId: string): Promise<void> {
  const sessionIds = await loadFutureActiveSessionIds(userId);
  for (const sessionId of sessionIds) {
    await enqueueForSession(sessionId, [userId]);
  }
}

/**
 * Marks every future active session a user attends for deletion — called
 * when they pause sync or disconnect, so their calendar mirrors "not syncing
 * anymore" going forward. Past events are left untouched; nothing here
 * removes history.
 *
 * @param {string} userId - The user pausing or disconnecting sync.
 * @returns {Promise<void>}
 */
export async function enqueueDeletionForUser(userId: string): Promise<void> {
  const sessionIds = await loadFutureActiveSessionIds(userId);
  for (const sessionId of sessionIds) {
    await enqueueDeletion(sessionId, userId);
  }
}

/**
 * Loads the plain data `buildCalendarEvent` needs for a session's UPSERT
 * rows: campaign name, schedule, and every current attendee's display name
 * (event descriptions list everyone playing, not just the row's own
 * recipient). Returns null for a session that no longer exists — should not
 * happen in practice, since sessions are never hard-deleted, but this reads
 * across a foreign key at a later point in time than when the row was
 * enqueued, so it stays defensive.
 *
 * @param {string} sessionId - The session to load.
 * @returns {Promise<SessionSyncData | null>} The data, or null if the session is gone.
 */
async function loadSessionSyncData(sessionId: string): Promise<SessionSyncData | null> {
  const session = await prisma.confirmedSession.findUnique({
    where: { id: sessionId },
    select: {
      date: true,
      startTime: true,
      durationMinutes: true,
      campaign: { select: { name: true } },
      attendees: { select: { user: { select: { name: true } } } },
    },
  });

  if (!session) {
    return null;
  }

  return {
    campaignName: session.campaign.name,
    dateIso: toIsoDate(session.date),
    startTime: session.startTime,
    durationMinutes: session.durationMinutes,
    attendeeNames: session.attendees.map((attendee) => attendee.user.name),
  };
}

/**
 * Marks a row FAILED after an unsuccessful attempt: bumps `attempts` (which
 * `isDueForRetry` and the `MAX_SYNC_ATTEMPTS` cap key off), records the
 * diagnostic message, and stamps `lastAttemptAt` so the exponential backoff
 * has a baseline for the next check.
 *
 * @param {string} rowId - The `SessionCalendarEvent` row id.
 * @param {string} errorMessage - A short diagnostic, stored verbatim (not an i18n key — this is a developer-facing log, not user-facing text).
 * @returns {Promise<void>}
 */
async function markRowFailed(rowId: string, errorMessage: string): Promise<void> {
  await prisma.sessionCalendarEvent.update({
    where: { id: rowId },
    data: {
      status: SyncStatus.FAILED,
      attempts: { increment: 1 },
      lastError: errorMessage,
      lastAttemptAt: new Date(),
    },
  });
}

/**
 * Marks a row DELETED after a successful (or no-op) deletion. Deliberately
 * leaves `googleEventId` untouched — it stays useful as a historical trace of
 * which Google event this row once corresponded to.
 *
 * @param {string} rowId - The `SessionCalendarEvent` row id.
 * @returns {Promise<void>}
 */
async function markRowDeleted(rowId: string): Promise<void> {
  await prisma.sessionCalendarEvent.update({
    where: { id: rowId },
    data: { status: SyncStatus.DELETED, lastAttemptAt: new Date(), lastError: null },
  });
}

/**
 * Marks a row SYNCED after a successful insert or patch.
 *
 * @param {string} rowId - The `SessionCalendarEvent` row id.
 * @param {string} googleEventId - The Google event id (new, or the existing one after a patch).
 * @returns {Promise<void>}
 */
async function markRowSynced(rowId: string, googleEventId: string): Promise<void> {
  await prisma.sessionCalendarEvent.update({
    where: { id: rowId },
    data: {
      status: SyncStatus.SYNCED,
      googleEventId,
      syncedAt: new Date(),
      lastAttemptAt: new Date(),
      lastError: null,
      attempts: 0,
    },
  });
}

/**
 * Marks a user's Google connection broken, mirroring `oauth.ts`'s
 * `getAccessToken`. Used when the Calendar API itself rejects a token
 * `getAccessToken` had just considered fresh (401/403 on the actual call) —
 * the same recovery path as a revoked refresh token: reconnecting from
 * `/profile` is what fixes it, not retrying.
 *
 * @param {string} userId - The user whose connection just failed irrecoverably.
 * @returns {Promise<void>}
 */
async function markUserBroken(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { googleSyncBrokenAt: new Date() } });
}

/**
 * Resolves a failed Google API call for one row: an auth failure marks the
 * user's connection broken and leaves the row untouched (spending an attempt
 * would be pointless — the same token fails identically every time); any
 * other failure marks the row FAILED, spending one attempt.
 *
 * @param {PendingSyncRow} row - The row being processed.
 * @param {{ authFailure: boolean; errorMessage: string }} failure - The classified failure from `calendarClient.ts`.
 * @returns {Promise<"failed">} Always `"failed"`, for the caller's tally.
 */
async function handleGoogleFailure(
  row: PendingSyncRow,
  failure: { authFailure: boolean; errorMessage: string },
): Promise<"failed"> {
  if (failure.authFailure) {
    // Deliberately not written to the row (see the tokenResult.revoked branch
    // above) — but still worth a server log, since otherwise this leaves no
    // trace anywhere that a sync silently stalled.
    console.error(
      "[GOOGLE-SYNC/PROCESS] Calendar API rejected the access token for user:",
      row.userId,
      failure.errorMessage,
    );
    await markUserBroken(row.userId);
    return "failed";
  }
  await markRowFailed(row.id, failure.errorMessage);
  return "failed";
}

/**
 * Records a `CalendarEventLog` row for a session event write — every
 * `processRow` branch that actually reaches Google logs through here, whether
 * the call succeeded or failed. Never covers rows resolved without a Google
 * call (a DELETE with no `googleEventId`, or a revoked token).
 *
 * @param {PendingSyncRow} row - The ledger row that was just processed.
 * @param {CalendarEventAction} action - CREATE, UPDATE or DELETE.
 * @param {MutateEventResult | { ok: true; eventId: string } | GoogleApiFailureLike} result - The Google API call's outcome.
 * @param {string | null} googleEventId - The event id involved (new for CREATE, existing otherwise).
 * @param {SyncTrigger} trigger - What caused this sweep to run.
 * @param {string | null} cronRunId - The triggering `CronRun`, when `trigger` is CRON.
 * @returns {Promise<void>}
 */
async function logSessionEvent(
  row: PendingSyncRow,
  action: CalendarEventAction,
  result: { ok: true } | { ok: false; errorMessage: string },
  googleEventId: string | null,
  trigger: SyncTrigger,
  cronRunId: string | null,
): Promise<void> {
  await logCalendarEvent({
    userId: row.userId,
    kind: CalendarEventKind.SESSION,
    action,
    trigger,
    subjectId: row.sessionId,
    googleEventId,
    success: result.ok,
    error: result.ok ? null : result.errorMessage,
    cronRunId,
  });
}

/**
 * Drives a single sync row to completion: resolves a fresh access token,
 * dispatches to insert/patch/delete based on `operation` and whether a
 * `googleEventId` already exists, and writes back the outcome.
 *
 * @param {PendingSyncRow} row - The ledger row to process.
 * @param {SessionSyncData | null} sessionData - Preloaded session data for an UPSERT row (unused for DELETE); null when the session no longer exists.
 * @param {SyncTrigger} trigger - What caused this sweep to run (logged with every real Google call).
 * @param {string | null} cronRunId - The triggering `CronRun`, when `trigger` is CRON.
 * @returns {Promise<"processed" | "failed">} The outcome, for the caller's tally.
 */
async function processRow(
  row: PendingSyncRow,
  sessionData: SessionSyncData | null,
  trigger: SyncTrigger,
  cronRunId: string | null,
): Promise<"processed" | "failed"> {
  const tokenResult = await getAccessToken(row.userId);
  if (!tokenResult.ok) {
    if (tokenResult.error === "integrations.google.errors.revoked") {
      // getAccessToken already stamped googleSyncBrokenAt; leave the row as
      // it was so it resumes once the user reconnects, instead of burning
      // through the attempt budget on a token that cannot recover.
      return "failed";
    }
    await markRowFailed(row.id, tokenResult.error);
    return "failed";
  }
  const accessToken = tokenResult.accessToken;

  if (row.operation === SyncOperation.DELETE) {
    if (!row.googleEventId) {
      await markRowDeleted(row.id);
      return "processed";
    }
    const result: MutateEventResult = await deleteEvent(accessToken, row.googleEventId);
    await logSessionEvent(row, CalendarEventAction.DELETE, result, row.googleEventId, trigger, cronRunId);
    if (!result.ok) {
      return handleGoogleFailure(row, result);
    }
    await markRowDeleted(row.id);
    return "processed";
  }

  // operation === UPSERT
  if (!sessionData) {
    await markRowFailed(row.id, "Session no longer exists.");
    return "failed";
  }

  const recipient = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { locale: true },
  });

  const eventBody = buildCalendarEvent({
    sessionId: row.sessionId,
    campaignName: sessionData.campaignName,
    dateIso: sessionData.dateIso,
    startTime: sessionData.startTime,
    durationMinutes: sessionData.durationMinutes,
    attendeeNames: sessionData.attendeeNames,
    locale: recipient?.locale ?? DEFAULT_LOCALE,
    timezone: env.APP_TIMEZONE,
    appUrl: env.AUTH_URL ?? null,
  });

  if (row.googleEventId) {
    const result = await patchEvent(accessToken, row.googleEventId, eventBody);
    await logSessionEvent(row, CalendarEventAction.UPDATE, result, row.googleEventId, trigger, cronRunId);
    if (!result.ok) {
      return handleGoogleFailure(row, result);
    }
    await markRowSynced(row.id, row.googleEventId);
    return "processed";
  }

  const result = await insertEvent(accessToken, eventBody);
  await logSessionEvent(
    row,
    CalendarEventAction.CREATE,
    result,
    result.ok ? result.eventId : null,
    trigger,
    cronRunId,
  );
  if (!result.ok) {
    return handleGoogleFailure(row, result);
  }
  await markRowSynced(row.id, result.eventId);
  return "processed";
}

export type ProcessPendingResult = { processed: number; failed: number };

/**
 * Walks due PENDING/FAILED sync rows (oldest first, capped at `limit`) and
 * drives each one to completion against the Google Calendar API. Rows are
 * grouped by session so a session with several attendees loads its shared
 * data (campaign name, schedule, attendee names) once instead of once per
 * row. Called after a session mutation commits (`after()` in the API
 * routes), by the manual "Reintentar" action, and by the optional cron
 * sweeper (roadmap #23 phase 5) — always after the mutation's own
 * `try/catch`, so a Google outage never turns a successful confirmation into
 * a failed response.
 *
 * @param {object} [options]
 * @param {string} [options.userId] - Restrict to one user's rows (manual retry); omitted processes across all users.
 * @param {number} [options.limit] - Maximum rows to process in this call.
 * @param {SyncTrigger} [options.trigger] - What caused this sweep to run, recorded on every `CalendarEventLog` row it writes. Defaults to AFTER_RESPONSE (the opportunistic post-mutation sweep).
 * @param {string} [options.cronRunId] - The triggering `CronRun`'s id, when `trigger` is CRON.
 * @returns {Promise<ProcessPendingResult>} How many rows synced vs. failed.
 */
export async function processPending(
  options: { userId?: string; limit?: number; trigger?: SyncTrigger; cronRunId?: string } = {},
): Promise<ProcessPendingResult> {
  const limit = options.limit ?? DEFAULT_PROCESS_LIMIT;
  const trigger: SyncTrigger = options.trigger ?? SyncTrigger.AFTER_RESPONSE;
  const cronRunId = options.cronRunId ?? null;

  try {
    const candidates: PendingSyncRow[] = await prisma.sessionCalendarEvent.findMany({
      where: {
        status: { in: [SyncStatus.PENDING, SyncStatus.FAILED] },
        attempts: { lt: MAX_SYNC_ATTEMPTS },
        ...(options.userId ? { userId: options.userId } : {}),
      },
      select: {
        id: true,
        sessionId: true,
        userId: true,
        googleEventId: true,
        operation: true,
        attempts: true,
        lastAttemptAt: true,
      },
      orderBy: { lastAttemptAt: "asc" },
      take: CANDIDATE_FETCH_CAP,
    });

    const now = new Date();
    const due = candidates
      .filter((row) => isDueForRetry(row.attempts, row.lastAttemptAt, now))
      .slice(0, limit);

    const rowsBySession = new Map<string, PendingSyncRow[]>();
    for (const row of due) {
      const existing = rowsBySession.get(row.sessionId);
      if (existing) {
        existing.push(row);
      } else {
        rowsBySession.set(row.sessionId, [row]);
      }
    }

    let processed = 0;
    let failed = 0;

    for (const [sessionId, rows] of rowsBySession) {
      const needsSessionData = rows.some((row) => row.operation === SyncOperation.UPSERT);
      const sessionData = needsSessionData ? await loadSessionSyncData(sessionId) : null;

      for (const row of rows) {
        const outcome = await processRow(row, sessionData, trigger, cronRunId);
        if (outcome === "processed") {
          processed += 1;
        } else {
          failed += 1;
        }
      }
    }

    return { processed, failed };
  } catch (error) {
    console.error("[GOOGLE-SYNC/PROCESS] Failed to process the sync queue:", error);
    return { processed: 0, failed: 0 };
  }
}

/** Rows processed by the opportunistic post-response sweep triggered from the session API routes. */
const AFTER_RESPONSE_PROCESS_LIMIT = 25;

/**
 * Schedules an opportunistic sync sweep to run after the current response has
 * already been sent (`next/server`'s `after()`), so a caller's HTTP response
 * is never delayed by a call to Google. Called from a session-mutation route
 * right after a successful confirm/update/cancel/add-attendee/remove-
 * attendee — it does not scope to what that specific mutation enqueued, it
 * just picks up whatever across the whole ledger is due, which is cheap and
 * keeps every route's wiring identical.
 *
 * @returns {void}
 */
export function scheduleSyncSweep(): void {
  after(async () => {
    try {
      await processPending({ limit: AFTER_RESPONSE_PROCESS_LIMIT });
    } catch (error) {
      console.error("[GOOGLE-SYNC/AFTER] Deferred sync sweep failed:", error);
    }
  });
}
