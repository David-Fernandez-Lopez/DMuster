import { SyncStatus } from "@/generated/prisma/enums";
import { enqueueForSession } from "@/lib/google/calendarSyncService";
import { prisma } from "@/lib/prisma";

jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    confirmedSessionAttendee: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    sessionCalendarEvent: { updateMany: jest.fn(), upsert: jest.fn() },
  },
}));
jest.mock("@/lib/env", () => ({ env: { APP_TIMEZONE: "Europe/Madrid", AUTH_URL: null } }));
jest.mock("@/lib/today", () => ({ todayIso: () => "2026-08-27" }));

const syncEnabledUsers = prisma.user.findMany as jest.Mock;
const updateRows = prisma.sessionCalendarEvent.updateMany as jest.Mock;
const upsertRow = prisma.sessionCalendarEvent.upsert as jest.Mock;

describe("enqueueForSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    syncEnabledUsers.mockResolvedValue([{ id: "user-1" }]);
    updateRows.mockResolvedValue({ count: 0 });
    upsertRow.mockResolvedValue({});
  });

  // Re-queuing used to blank `googleEventId` on every row it touched, SYNCED
  // ones included. That threw away the only handle to an event that exists, so
  // the next pass inserted a second one beside it and the first became
  // unreachable — impossible to update, impossible to delete.
  it("keeps the event id of rows that are not DELETED", async () => {
    await enqueueForSession("session-1", ["user-1"]);

    const update = upsertRow.mock.calls[0][0].update;
    expect(update).not.toHaveProperty("googleEventId");
    expect(update).toMatchObject({ status: SyncStatus.PENDING, attempts: 0 });
  });

  // A DELETED row's id points at an event Google no longer has, so it does have
  // to go — otherwise the next pass PATCHes something that is not there.
  it("clears the event id only on DELETED rows", async () => {
    await enqueueForSession("session-1", ["user-1"]);

    expect(updateRows).toHaveBeenCalledWith({
      where: { sessionId: "session-1", userId: { in: ["user-1"] }, status: SyncStatus.DELETED },
      data: { googleEventId: null },
    });
  });

  it("clears before it queues, so the upsert never has to decide", async () => {
    await enqueueForSession("session-1", ["user-1"]);

    expect(updateRows.mock.invocationCallOrder[0]).toBeLessThan(
      upsertRow.mock.invocationCallOrder[0],
    );
  });

  it("does nothing when nobody involved has sync enabled", async () => {
    syncEnabledUsers.mockResolvedValue([]);

    await enqueueForSession("session-1", ["user-1"]);

    expect(updateRows).not.toHaveBeenCalled();
    expect(upsertRow).not.toHaveBeenCalled();
  });
});
