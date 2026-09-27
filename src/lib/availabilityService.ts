import { Prisma } from "@/generated/prisma/client";
import { AvailabilityStatus } from "@/generated/prisma/enums";
import { toIsoDate, toUtcDate } from "@/lib/date";
import { enqueueUpdateForAttendeeOnDate } from "@/lib/google/calendarSyncService";
import { prisma } from "@/lib/prisma";

/** Prisma error code raised when a record to update/delete does not exist. */
const RECORD_NOT_FOUND = "P2025";

/**
 * Result of an availability mutation. `error` holds an i18n key on failure.
 * `calendarQueued` tells the caller that Google Calendar events were queued
 * for a refresh, so it should schedule a sync sweep.
 */
export type AvailabilityMutationResult =
  | { ok: true; calendarQueued: boolean }
  | { ok: false; error: string };

/**
 * Queues a refresh of the user's session events for a day when their answer
 * switched to or from "Sí (Online)" — the only answer a calendar event shows
 * (its "(Online)" title and the line naming who plays online). Any other
 * change, like Sí → Tal vez, leaves Google alone. Never throws: the answer is
 * already saved by then, so a failure here is logged and reported as "nothing
 * queued" instead of failing the request.
 *
 * @param {string} userId - The user whose answer changed.
 * @param {string} dateIso - The day of the answer, "YYYY-MM-DD".
 * @param {AvailabilityStatus | null} previous - The answer before the change (`null` = unanswered).
 * @param {AvailabilityStatus | null} next - The answer after the change (`null` = cleared).
 * @param {"SET" | "CLEAR"} action - The mutation, for the log prefix.
 * @returns {Promise<boolean>} Whether events were queued (a sweep is worth scheduling).
 */
async function refreshOnlineCalendarEvents(
  userId: string,
  dateIso: string,
  previous: AvailabilityStatus | null,
  next: AvailabilityStatus | null,
  action: "SET" | "CLEAR",
): Promise<boolean> {
  const wasOnline = previous === AvailabilityStatus.ONLINE;
  const isOnline = next === AvailabilityStatus.ONLINE;
  if (wasOnline === isOnline) {
    return false;
  }

  try {
    return await enqueueUpdateForAttendeeOnDate(userId, dateIso);
  } catch (error) {
    console.error(
      `[AVAILABILITY/${action}] Failed to queue the calendar refresh for user ${userId} on ${dateIso}:`,
      error,
    );
    return false;
  }
}

/**
 * Fetches a user's own stored availability responses within an inclusive date
 * range, as a map keyed by calendar day ("YYYY-MM-DD"). Rows hold YES, NO, MAYBE
 * or ONLINE; a missing key means the user has not responded — the derived pending
 * "T" state, which is never stored. Both bounds are built at UTC midnight to
 * match how the dates are stored.
 *
 * @param {string} userId - Id of the user whose responses are read.
 * @param {string} startIso - Range start, "YYYY-MM-DD" (inclusive).
 * @param {string} endIso - Range end, "YYYY-MM-DD" (inclusive).
 * @returns {Promise<Record<string, AvailabilityStatus>>} Responses keyed by day.
 */
export async function getUserAvailability(
  userId: string,
  startIso: string,
  endIso: string,
): Promise<Record<string, AvailabilityStatus>> {
  const rows = await prisma.availability.findMany({
    where: {
      userId,
      date: { gte: toUtcDate(startIso), lte: toUtcDate(endIso) },
    },
    select: { date: true, status: true },
  });

  const responses: Record<string, AvailabilityStatus> = {};
  for (const row of rows) {
    responses[toIsoDate(row.date)] = row.status;
  }
  return responses;
}

/**
 * Sets (creates or replaces) the user's own response for a day. The response is
 * global per day — it applies to every campaign the player belongs to. Upserts
 * on the unique `(date, userId)` pair, storing the date at UTC midnight. The
 * caller must have already validated the date and its eligibility. The
 * previous answer is read first so a switch to or from ONLINE can refresh the
 * user's session events for that day (`refreshOnlineCalendarEvents`).
 *
 * @param {string} userId - Id of the responding user.
 * @param {string} dateIso - The day being answered, "YYYY-MM-DD".
 * @param {AvailabilityStatus} status - The stored response (YES, NO, MAYBE or ONLINE).
 * @returns {Promise<AvailabilityMutationResult>} Success (with whether calendar
 *   events were queued), or an error key (`availability.errors.unknown`).
 */
export async function setAvailability(
  userId: string,
  dateIso: string,
  status: AvailabilityStatus,
): Promise<AvailabilityMutationResult> {
  let previous: AvailabilityStatus | null;
  try {
    const date = toUtcDate(dateIso);
    const existing = await prisma.availability.findUnique({
      where: { date_userId: { date, userId } },
      select: { status: true },
    });
    previous = existing?.status ?? null;

    await prisma.availability.upsert({
      where: { date_userId: { date, userId } },
      update: { status },
      create: { date, userId, status },
      select: { id: true },
    });
  } catch (error) {
    console.error("[AVAILABILITY/SET] Failed to set availability:", error);
    return { ok: false, error: "availability.errors.unknown" };
  }

  return {
    ok: true,
    calendarQueued: await refreshOnlineCalendarEvents(
      userId,
      dateIso,
      previous,
      status,
      "SET",
    ),
  };
}

/**
 * Clears the user's own response for a day by deleting the row (the pending "T"
 * state is the *absence* of a row, never a stored value). Idempotent: clearing
 * a day that has no stored response is a success, not an error. Clearing an
 * ONLINE answer refreshes the user's session events for that day
 * (`refreshOnlineCalendarEvents`).
 *
 * @param {string} userId - Id of the user whose response is cleared.
 * @param {string} dateIso - The day being cleared, "YYYY-MM-DD".
 * @returns {Promise<AvailabilityMutationResult>} Success (with whether calendar
 *   events were queued), or an error key (`availability.errors.unknown`).
 */
export async function clearAvailability(
  userId: string,
  dateIso: string,
): Promise<AvailabilityMutationResult> {
  let previous: AvailabilityStatus;
  try {
    const deleted = await prisma.availability.delete({
      where: { date_userId: { date: toUtcDate(dateIso), userId } },
      select: { status: true },
    });
    previous = deleted.status;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      // Nothing to delete — the day is already unanswered, the intended state.
      return { ok: true, calendarQueued: false };
    }

    console.error("[AVAILABILITY/CLEAR] Failed to clear availability:", error);
    return { ok: false, error: "availability.errors.unknown" };
  }

  return {
    ok: true,
    calendarQueued: await refreshOnlineCalendarEvents(
      userId,
      dateIso,
      previous,
      null,
      "CLEAR",
    ),
  };
}
