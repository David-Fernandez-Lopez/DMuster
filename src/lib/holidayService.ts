import { Prisma } from "@/generated/prisma/client";
import { toIsoDate, toUtcDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";

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
 * Removes a holiday by id. A missing record (e.g. deleted concurrently)
 * surfaces as a friendly i18n error key rather than throwing.
 *
 * @param {string} id - Id of the holiday to remove.
 * @returns {Promise<HolidayMutationResult>} Success with the id, or an error key
 *   (`holidays.errors.notFound` / `holidays.errors.unknown`).
 */
export async function removeHoliday(
  id: string,
): Promise<HolidayMutationResult> {
  try {
    await prisma.holiday.delete({ where: { id }, select: { id: true } });

    return { ok: true, id };
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
