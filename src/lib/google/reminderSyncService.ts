// Drives the monthly availability reminder ledger (`AvailabilityReminderEvent`,
// roadmap #23.4): `reconcileReminders` decides, once a day, who still has
// unanswered eligible days NEXT month and only ever writes PENDING/DELETED
// rows — it never calls Google itself. `processPendingReminders` is the only
// function that actually talks to Google, mirroring
// `calendarSyncService.ts#processPending`'s PENDING/FAILED → SYNCED/DELETED
// lifecycle, backoff and retry cap.

import { DEFAULT_LOCALE } from "@/i18n/settings";
import {
  addMonths,
  eligibleDaysOfMonth,
  lastDayOfMonth,
  toIsoDate,
  toUtcDate,
  todayIso,
} from "@/lib/date";
import { env } from "@/lib/env";
import {
  CalendarEventAction,
  CalendarEventKind,
  SyncOperation,
  SyncStatus,
  SyncTrigger,
} from "@/generated/prisma/enums";
import { listHolidays } from "@/lib/holidayService";
import { prisma } from "@/lib/prisma";

import { logCalendarEvent } from "./calendarEventLog";
import { deleteEvent, insertEvent, patchEvent, type MutateEventResult } from "./calendarClient";
import { getAccessToken } from "./oauth";
import { buildReminderEvent } from "./reminderEvent";
import { isDueForRetry, MAX_SYNC_ATTEMPTS } from "./syncBackoff";

/** How many due rows `processPendingReminders` handles in one call by default. */
const DEFAULT_PROCESS_LIMIT = 200;

/** Sanity ceiling on candidate rows loaded before filtering by due-ness. */
const CANDIDATE_FETCH_CAP = 500;

type PendingReminderRow = {
  id: string;
  userId: string;
  month: string;
  googleEventId: string | null;
  operation: SyncOperation;
  attempts: number;
  lastAttemptAt: Date | null;
};

export type ReconcileRemindersResult = { evaluated: number; enqueued: number; cleared: number };

/**
 * Decides, for every Google-sync-enabled user in at least one campaign,
 * whether NEXT month still has an eligible day they have not answered, and
 * upserts/clears the `AvailabilityReminderEvent` row for the current month
 * accordingly. Never calls Google — only PENDING/DELETED transitions.
 *
 * @returns {Promise<ReconcileRemindersResult>} How many users were checked,
 *   how many gained a pending reminder, and how many had theirs cleared.
 */
export async function reconcileReminders(): Promise<ReconcileRemindersResult> {
  const currentMonth = todayIso().slice(0, 7);
  const targetMonth = addMonths(currentMonth, 1);

  const candidates = await prisma.user.findMany({
    where: { googleSyncEnabled: true, campaigns: { some: {} } },
    select: { id: true },
  });

  if (candidates.length === 0) {
    return { evaluated: 0, enqueued: 0, cleared: 0 };
  }

  const holidays = await listHolidays();
  const holidaySet = new Set(holidays.map((holiday) => holiday.date));
  const eligibleDays = eligibleDaysOfMonth(targetMonth, holidaySet);

  const rangeStart = toUtcDate(eligibleDays[0] ?? `${targetMonth}-01`);
  const rangeEnd = toUtcDate(lastDayOfMonth(targetMonth));

  const candidateIds = candidates.map((user) => user.id);
  const responses = await prisma.availability.findMany({
    where: { userId: { in: candidateIds }, date: { gte: rangeStart, lte: rangeEnd } },
    select: { userId: true, date: true },
  });

  const answeredByUser = new Map<string, Set<string>>();
  for (const response of responses) {
    const iso = toIsoDate(response.date);
    const existing = answeredByUser.get(response.userId);
    if (existing) {
      existing.add(iso);
    } else {
      answeredByUser.set(response.userId, new Set([iso]));
    }
  }

  let enqueued = 0;
  let cleared = 0;

  for (const userId of candidateIds) {
    const answered = answeredByUser.get(userId) ?? new Set<string>();
    const incomplete = eligibleDays.some((day) => !answered.has(day));

    if (incomplete) {
      await prisma.availabilityReminderEvent.upsert({
        where: { userId_month: { userId, month: targetMonth } },
        create: { userId, month: targetMonth, status: SyncStatus.PENDING, operation: SyncOperation.UPSERT },
        update: {},
      });
      // A previously cleared reminder (DELETED) needs a fresh insertEvent, not
      // a patch on an event Google no longer has — same idempotency trick as
      // calendarSyncService.ts#enqueueForSession.
      await prisma.availabilityReminderEvent.updateMany({
        where: { userId, month: targetMonth, status: SyncStatus.DELETED },
        data: {
          status: SyncStatus.PENDING,
          operation: SyncOperation.UPSERT,
          attempts: 0,
          lastError: null,
          googleEventId: null,
        },
      });
      enqueued += 1;
    } else {
      const notAlreadyDeleted = { status: { not: SyncStatus.DELETED } };
      const clearedNoEvent = await prisma.availabilityReminderEvent.updateMany({
        where: { userId, month: targetMonth, ...notAlreadyDeleted, googleEventId: null },
        data: { status: SyncStatus.DELETED, operation: SyncOperation.DELETE },
      });
      const queuedForDeletion = await prisma.availabilityReminderEvent.updateMany({
        where: { userId, month: targetMonth, ...notAlreadyDeleted, googleEventId: { not: null } },
        data: { status: SyncStatus.PENDING, operation: SyncOperation.DELETE, attempts: 0, lastError: null },
      });
      if (clearedNoEvent.count > 0 || queuedForDeletion.count > 0) {
        cleared += 1;
      }
    }
  }

  return { evaluated: candidateIds.length, enqueued, cleared };
}

/**
 * Marks a row FAILED after an unsuccessful attempt, mirroring
 * `calendarSyncService.ts#markRowFailed`.
 *
 * @param {string} rowId - The `AvailabilityReminderEvent` row id.
 * @param {string} errorMessage - A short diagnostic, stored verbatim.
 * @returns {Promise<void>}
 */
async function markRowFailed(rowId: string, errorMessage: string): Promise<void> {
  await prisma.availabilityReminderEvent.update({
    where: { id: rowId },
    data: { status: SyncStatus.FAILED, attempts: { increment: 1 }, lastError: errorMessage, lastAttemptAt: new Date() },
  });
}

/**
 * Marks a row DELETED after a successful (or no-op) deletion.
 *
 * @param {string} rowId - The `AvailabilityReminderEvent` row id.
 * @returns {Promise<void>}
 */
async function markRowDeleted(rowId: string): Promise<void> {
  await prisma.availabilityReminderEvent.update({
    where: { id: rowId },
    data: { status: SyncStatus.DELETED, lastAttemptAt: new Date(), lastError: null },
  });
}

/**
 * Marks a row SYNCED after a successful insert or patch.
 *
 * @param {string} rowId - The `AvailabilityReminderEvent` row id.
 * @param {string} googleEventId - The Google event id (new, or the existing one after a patch).
 * @returns {Promise<void>}
 */
async function markRowSynced(rowId: string, googleEventId: string): Promise<void> {
  await prisma.availabilityReminderEvent.update({
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
 * Marks a user's Google connection broken, mirroring
 * `calendarSyncService.ts#markUserBroken`.
 *
 * @param {string} userId - The user whose connection just failed irrecoverably.
 * @returns {Promise<void>}
 */
async function markUserBroken(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { googleSyncBrokenAt: new Date() } });
}

/**
 * Resolves a failed Google API call for one row, mirroring
 * `calendarSyncService.ts#handleGoogleFailure`.
 *
 * @param {PendingReminderRow} row - The row being processed.
 * @param {{ authFailure: boolean; errorMessage: string }} failure - The classified failure from `calendarClient.ts`.
 * @returns {Promise<"failed">} Always `"failed"`, for the caller's tally.
 */
async function handleGoogleFailure(
  row: PendingReminderRow,
  failure: { authFailure: boolean; errorMessage: string },
): Promise<"failed"> {
  if (failure.authFailure) {
    console.error(
      "[GOOGLE-REMINDER/PROCESS] Calendar API rejected the access token for user:",
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
 * Records a `CalendarEventLog` row for a reminder event write, mirroring
 * `calendarSyncService.ts#logSessionEvent`.
 *
 * @param {PendingReminderRow} row - The ledger row that was just processed.
 * @param {CalendarEventAction} action - CREATE, UPDATE or DELETE.
 * @param {{ ok: true } | { ok: false; errorMessage: string }} result - The Google API call's outcome.
 * @param {string | null} googleEventId - The event id involved.
 * @param {SyncTrigger} trigger - What caused this sweep to run.
 * @param {string | null} cronRunId - The triggering `CronRun`, when `trigger` is CRON.
 * @returns {Promise<void>}
 */
async function logReminderEvent(
  row: PendingReminderRow,
  action: CalendarEventAction,
  result: { ok: true } | { ok: false; errorMessage: string },
  googleEventId: string | null,
  trigger: SyncTrigger,
  cronRunId: string | null,
): Promise<void> {
  await logCalendarEvent({
    userId: row.userId,
    kind: CalendarEventKind.REMINDER,
    action,
    trigger,
    subjectId: row.month,
    googleEventId,
    success: result.ok,
    error: result.ok ? null : result.errorMessage,
    cronRunId,
  });
}

/**
 * Drives a single reminder row to completion: resolves a fresh access token,
 * dispatches to insert/patch/delete, and writes back the outcome. A DELETE
 * with no `googleEventId` is resolved without contacting Google. An UPSERT
 * whose event day has already passed (the cron was down for a whole month) is
 * marked DELETED without contacting Google either — there is no point
 * creating a reminder in the past.
 *
 * @param {PendingReminderRow} row - The ledger row to process.
 * @param {SyncTrigger} trigger - What caused this sweep to run.
 * @param {string | null} cronRunId - The triggering `CronRun`, when `trigger` is CRON.
 * @returns {Promise<"processed" | "failed">} The outcome, for the caller's tally.
 */
async function processReminderRow(
  row: PendingReminderRow,
  trigger: SyncTrigger,
  cronRunId: string | null,
): Promise<"processed" | "failed"> {
  const tokenResult = await getAccessToken(row.userId);
  if (!tokenResult.ok) {
    if (tokenResult.error === "integrations.google.errors.revoked") {
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
    await logReminderEvent(row, CalendarEventAction.DELETE, result, row.googleEventId, trigger, cronRunId);
    if (!result.ok) {
      return handleGoogleFailure(row, result);
    }
    await markRowDeleted(row.id);
    return "processed";
  }

  // operation === UPSERT
  const eventDateIso = lastDayOfMonth(addMonths(row.month, -1));
  if (eventDateIso < todayIso()) {
    // The reminder's own day is already in the past (a month-long cron
    // outage) — creating it now would be misleading, so just retire the row.
    await markRowDeleted(row.id);
    return "processed";
  }

  const recipient = await prisma.user.findUnique({ where: { id: row.userId }, select: { locale: true } });

  const eventBody = buildReminderEvent({
    month: row.month,
    dateIso: eventDateIso,
    locale: recipient?.locale ?? DEFAULT_LOCALE,
    appUrl: env.AUTH_URL ?? null,
  });

  if (row.googleEventId) {
    const result = await patchEvent(accessToken, row.googleEventId, eventBody);
    await logReminderEvent(row, CalendarEventAction.UPDATE, result, row.googleEventId, trigger, cronRunId);
    if (!result.ok) {
      return handleGoogleFailure(row, result);
    }
    await markRowSynced(row.id, row.googleEventId);
    return "processed";
  }

  const result = await insertEvent(accessToken, eventBody);
  await logReminderEvent(
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

export type ProcessPendingRemindersResult = { processed: number; failed: number };

/**
 * Walks due PENDING/FAILED reminder rows (oldest first, capped at `limit`)
 * and drives each one to completion against the Google Calendar API. Mirrors
 * `calendarSyncService.ts#processPending`'s shape; called by the
 * `availability-reminders` cron route right after `reconcileReminders`.
 *
 * @param {object} [options]
 * @param {number} [options.limit] - Maximum rows to process in this call.
 * @param {SyncTrigger} [options.trigger] - What caused this sweep to run, recorded on every `CalendarEventLog` row it writes. Defaults to CRON — unlike session sync, reminders have no opportunistic or manual-retry caller yet.
 * @param {string} [options.cronRunId] - The triggering `CronRun`'s id, when `trigger` is CRON.
 * @returns {Promise<ProcessPendingRemindersResult>} How many rows synced vs. failed.
 */
export async function processPendingReminders(
  options: { limit?: number; trigger?: SyncTrigger; cronRunId?: string } = {},
): Promise<ProcessPendingRemindersResult> {
  const limit = options.limit ?? DEFAULT_PROCESS_LIMIT;
  const trigger: SyncTrigger = options.trigger ?? SyncTrigger.CRON;
  const cronRunId = options.cronRunId ?? null;

  try {
    const candidates: PendingReminderRow[] = await prisma.availabilityReminderEvent.findMany({
      where: { status: { in: [SyncStatus.PENDING, SyncStatus.FAILED] }, attempts: { lt: MAX_SYNC_ATTEMPTS } },
      select: {
        id: true,
        userId: true,
        month: true,
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

    let processed = 0;
    let failed = 0;

    for (const row of due) {
      const outcome = await processReminderRow(row, trigger, cronRunId);
      if (outcome === "processed") {
        processed += 1;
      } else {
        failed += 1;
      }
    }

    return { processed, failed };
  } catch (error) {
    console.error("[GOOGLE-REMINDER/PROCESS] Failed to process the reminder queue:", error);
    return { processed: 0, failed: 0 };
  }
}
