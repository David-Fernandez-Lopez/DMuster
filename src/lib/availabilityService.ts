import { Prisma } from "@/generated/prisma/client";
import type { AvailabilityStatus } from "@/generated/prisma/enums";
import { toIsoDate, toUtcDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";

/** Prisma error code raised when a record to update/delete does not exist. */
const RECORD_NOT_FOUND = "P2025";

/** Result of an availability mutation. `error` holds an i18n key on failure. */
export type AvailabilityMutationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Fetches a user's own stored availability responses within an inclusive date
 * range, as a map keyed by calendar day ("YYYY-MM-DD"). Rows hold YES, NO or
 * MAYBE; a missing key means the user has not responded — the derived pending
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
 * caller must have already validated the date and its eligibility.
 *
 * @param {string} userId - Id of the responding user.
 * @param {string} dateIso - The day being answered, "YYYY-MM-DD".
 * @param {AvailabilityStatus} status - The stored response (YES, NO or MAYBE).
 * @returns {Promise<AvailabilityMutationResult>} Success, or an error key
 *   (`availability.errors.unknown`).
 */
export async function setAvailability(
  userId: string,
  dateIso: string,
  status: AvailabilityStatus,
): Promise<AvailabilityMutationResult> {
  try {
    const date = toUtcDate(dateIso);
    await prisma.availability.upsert({
      where: { date_userId: { date, userId } },
      update: { status },
      create: { date, userId, status },
      select: { id: true },
    });

    return { ok: true };
  } catch (error) {
    console.error("[AVAILABILITY/SET] Failed to set availability:", error);
    return { ok: false, error: "availability.errors.unknown" };
  }
}

/**
 * Clears the user's own response for a day by deleting the row (the pending "T"
 * state is the *absence* of a row, never a stored value). Idempotent: clearing
 * a day that has no stored response is a success, not an error.
 *
 * @param {string} userId - Id of the user whose response is cleared.
 * @param {string} dateIso - The day being cleared, "YYYY-MM-DD".
 * @returns {Promise<AvailabilityMutationResult>} Success, or an error key
 *   (`availability.errors.unknown`).
 */
export async function clearAvailability(
  userId: string,
  dateIso: string,
): Promise<AvailabilityMutationResult> {
  try {
    await prisma.availability.delete({
      where: { date_userId: { date: toUtcDate(dateIso), userId } },
      select: { id: true },
    });

    return { ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      // Nothing to delete — the day is already unanswered, the intended state.
      return { ok: true };
    }

    console.error("[AVAILABILITY/CLEAR] Failed to clear availability:", error);
    return { ok: false, error: "availability.errors.unknown" };
  }
}
