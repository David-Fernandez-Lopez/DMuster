import { removeHoliday } from "@/lib/holidayService";
import { prisma } from "@/lib/prisma";

jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock("@/lib/today", () => ({ todayIso: () => "2026-08-27" }));

const transaction = prisma.$transaction as unknown as jest.Mock;

let tx: {
  holiday: { findUnique: jest.Mock; delete: jest.Mock };
  confirmedSession: { count: jest.Mock };
};

/**
 * Arranges a holiday on `dateIso` with `sessions` active confirmed sessions.
 *
 * @param {string} dateIso - The holiday's calendar day.
 * @param {number} sessions - Active sessions the date carries.
 */
function holidayOn(dateIso: string, sessions: number): void {
  tx.holiday.findUnique.mockResolvedValue({ date: new Date(`${dateIso}T00:00:00.000Z`) });
  tx.confirmedSession.count.mockResolvedValue(sessions);
}

describe("removeHoliday", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "info").mockImplementation(() => {});
    tx = {
      holiday: { findUnique: jest.fn(), delete: jest.fn().mockResolvedValue({ id: "h1" }) },
      confirmedSession: { count: jest.fn() },
    };
    transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  });

  // Removing the holiday does not remove the session: it keeps its activeDate,
  // keeps occupying the one-session-per-day slot so the campaign cannot confirm
  // that date again, and its events stay in the attendees' Google calendars.
  it("refuses while a confirmed session depends on the date", async () => {
    holidayOn("2026-09-15", 1);

    await expect(removeHoliday("h1", "actor-1")).resolves.toEqual({
      ok: false,
      error: "holidays.errors.hasSessions",
    });
    expect(tx.holiday.delete).not.toHaveBeenCalled();
  });

  it("removes a future date with no sessions on it", async () => {
    holidayOn("2026-09-15", 0);

    await expect(removeHoliday("h1", "actor-1")).resolves.toEqual({ ok: true, id: "h1" });
    expect(tx.holiday.delete).toHaveBeenCalled();
  });

  it("removes today's date when nothing is confirmed on it", async () => {
    holidayOn("2026-08-27", 0);

    await expect(removeHoliday("h1", "actor-1")).resolves.toEqual({ ok: true, id: "h1" });
  });

  it("still guards today, not only the future", async () => {
    holidayOn("2026-08-27", 1);

    await expect(removeHoliday("h1", "actor-1")).resolves.toEqual({
      ok: false,
      error: "holidays.errors.hasSessions",
    });
  });

  // A past holiday cannot cost anyone a session that has not happened yet, and
  // blocking those would leave entries nobody can ever clear.
  it("removes a past date without asking about sessions", async () => {
    holidayOn("2026-08-26", 99);

    await expect(removeHoliday("h1", "actor-1")).resolves.toEqual({ ok: true, id: "h1" });
    expect(tx.confirmedSession.count).not.toHaveBeenCalled();
  });

  it("reports a holiday that is already gone", async () => {
    tx.holiday.findUnique.mockResolvedValue(null);

    await expect(removeHoliday("h1", "actor-1")).resolves.toEqual({
      ok: false,
      error: "holidays.errors.notFound",
    });
  });

  // Deleting the row destroys `createdById`, the only record of who was
  // involved — so without this line a date every campaign depended on could
  // vanish with no way to find out who removed it.
  it("records the actor and the date it removed", async () => {
    holidayOn("2026-09-15", 0);

    await removeHoliday("h1", "actor-1");

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("[HOLIDAYS/REMOVE] 2026-09-15 removed by user actor-1"),
    );
  });
});
