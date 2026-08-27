import { Prisma } from "@/generated/prisma/client";
import { toIsoDate, toUtcDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { todayIso } from "@/lib/today";

/** Prisma error code raised when a record to update/delete does not exist. */
const RECORD_NOT_FOUND = "P2025";

/** Prisma error code raised on a unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

/** A holiday as consumed by the UI and the calendar: id + calendar day. */
export type HolidayDto = {
  id: string;
  /** The holiday's calendar day, "YYYY-MM-DD". */
  date: string;
};

/** Result of a holiday mutation. `error` holds an i18n key on failure. */
export type HolidayMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Lists every holiday ordered by date ascending, as calendar-day strings. Also
 * consumed by the calendar (roadmap #15) to compute day eligibility.
 *
 * @returns {Promise<HolidayDto[]>} All holidays, oldest first.
 */
export async function listHolidays(): Promise<HolidayDto[]> {
  const holidays = await prisma.holiday.findMany({
    select: { id: true, date: true },
    orderBy: { date: "asc" },
  });

  return holidays.map((holiday) => ({
    id: holiday.id,
    date: toIsoDate(holiday.date),
  }));
}

/**
 * Adds an extra weekday holiday, stored at UTC midnight so the calendar day
 * never shifts with the host timezone. The date must already be Zod-validated
 * (real day, not a weekend). A duplicate date (unique constraint) surfaces as a
 * friendly i18n error key rather than throwing.
 *
 * @param {string} dateIso - The holiday's calendar day, "YYYY-MM-DD".
 * @param {string} userId - Id of the DM adding it (recorded as `createdById`).
 * @returns {Promise<HolidayMutationResult>} Success with the new id, or an error
 *   key (`holidays.errors.duplicate` / `holidays.errors.unknown`).
 */
export async function addHoliday(
  dateIso: string,
  userId: string,
): Promise<HolidayMutationResult> {
  try {
    const holiday = await prisma.holiday.create({
      data: { date: toUtcDate(dateIso), createdById: userId },
      select: { id: true },
    });

    return { ok: true, id: holiday.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      return { ok: false, error: "holidays.errors.duplicate" };
    }

    console.error("[HOLIDAYS/ADD] Failed to add holiday:", error);
    return { ok: false, error: "holidays.errors.unknown" };
  }
}

/**
 * Removes a holiday by id, refusing while a confirmed session still depends on
 * it, and recording who did it.
 *
 * Holidays are global: a weekday is playable for the whole instance or for
 * nobody, so removing one takes the day away from every campaign at once, not
 * only from the person tapping the button. What happens to a session already
 * confirmed on that day is worse than it disappearing — it stays in the
 * database with its `activeDate`, keeps occupying the one-session-per-day slot
 * so its campaign cannot confirm that date again, and its events remain in the
 * attendees' Google calendars. Invisible in the app, alive everywhere else.
 *
 * The guard only applies from today onwards. A past holiday cannot cost anyone
 * a session that has not happened yet, and blocking those would leave the list
 * accumulating entries nobody can ever clear.
 *
 * The check and the delete share a transaction, which closes the ordinary
 * overlap but not a session confirmed in the same instant; that class of race
 * is what the conditional-write work addresses across the codebase.
 *
 * @param {string} id - Id of the holiday to remove.
 * @param {string} actorId - Id of the user performing the removal, for the audit line.
 * @returns {Promise<HolidayMutationResult>} Success with the id, or an error key
 *   (`holidays.errors.notFound` / `holidays.errors.hasSessions` /
 *   `holidays.errors.unknown`).
 */
export async function removeHoliday(
  id: string,
  actorId: string,
): Promise<HolidayMutationResult> {
  try {
    const removed = await prisma.$transaction(async (tx) => {
      const holiday = await tx.holiday.findUnique({
        where: { id },
        select: { date: true },
      });
      if (!holiday) {
        return { ok: false, error: "holidays.errors.notFound" } as const;
      }

      const dateIso = toIsoDate(holiday.date);

      if (dateIso >= todayIso()) {
        const activeSessions = await tx.confirmedSession.count({
          where: { date: holiday.date, cancelledAt: null },
        });
        if (activeSessions > 0) {
          return { ok: false, error: "holidays.errors.hasSessions" } as const;
        }
      }

      await tx.holiday.delete({ where: { id }, select: { id: true } });
      return { ok: true, id, dateIso } as const;
    });

    if (!removed.ok) {
      return removed;
    }

    // The row itself carried the only record of who added it, and deleting it
    // takes that with it — so without this line nobody could tell who removed a
    // date that every campaign depended on, or when.
    console.info(
      `[HOLIDAYS/REMOVE] ${removed.dateIso} removed by user ${actorId} at ${new Date().toISOString()}`,
    );

    return { ok: true, id: removed.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return { ok: false, error: "holidays.errors.notFound" };
    }

    console.error("[HOLIDAYS/REMOVE] Failed to remove holiday:", error);
    return { ok: false, error: "holidays.errors.unknown" };
  }
}
