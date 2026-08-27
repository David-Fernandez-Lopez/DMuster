import { processPending } from "@/lib/google/calendarSyncService";
import { processPendingReminders } from "@/lib/google/reminderSyncService";
import { prisma } from "@/lib/prisma";

// The generated Prisma client is ESM (`import.meta.url`) and ts-jest cannot
// parse it under the current CommonJS setup; it is reached here only through
// `holidayService`, for an error class these paths never hit.
jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    sessionCalendarEvent: { findMany: jest.fn() },
    availabilityReminderEvent: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/env", () => ({ env: { APP_TIMEZONE: "Europe/Madrid" } }));
jest.mock("@/lib/today", () => ({ todayIso: () => "2026-08-27" }));

const sessionRows = prisma.sessionCalendarEvent.findMany as jest.Mock;
const reminderRows = prisma.availabilityReminderEvent.findMany as jest.Mock;

/** The `where` clause the queue used to pick candidates in the last call. */
function whereOf(mock: jest.Mock): Record<string, unknown> {
  return mock.mock.calls[0][0].where;
}

describe("sync candidate selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionRows.mockResolvedValue([]);
    reminderRows.mockResolvedValue([]);
  });

  // A user whose token is revoked keeps rows that can never succeed. The
  // revoked-token path returns without stamping `lastAttemptAt` — on purpose,
  // so an unrecoverable failure does not burn the attempt budget — but the
  // ordering puts nulls first, so those rows head every sweep and fill it.
  // With a 200-row cron batch, one broken user stopped everyone else syncing.
  describe("session queue", () => {
    it("excludes broken users from a shared sweep", async () => {
      await processPending();

      expect(whereOf(sessionRows)).toMatchObject({
        user: { googleSyncBrokenAt: null },
      });
    });

    it("keeps a broken user when the sweep is scoped to them", async () => {
      // Otherwise "Reintentar" would silently do nothing for exactly the
      // people looking at the retry button. A single-user sweep has no shared
      // batch to crowd out.
      await processPending({ userId: "user-1" });

      const where = whereOf(sessionRows);
      expect(where).toMatchObject({ userId: "user-1" });
      expect(where).not.toHaveProperty("user");
    });
  });

  describe("reminder queue", () => {
    it("excludes broken users unconditionally", async () => {
      // This queue takes no per-user option: every sweep is a shared one.
      await processPendingReminders();

      expect(whereOf(reminderRows)).toMatchObject({
        user: { googleSyncBrokenAt: null },
      });
    });
  });
});
