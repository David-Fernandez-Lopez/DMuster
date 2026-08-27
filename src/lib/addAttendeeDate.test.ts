import { addAttendee } from "@/lib/confirmedSessionService";
import { getCampaignRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// The generated Prisma client is ESM and uses `import.meta.url`, which ts-jest
// cannot parse under the current CommonJS setup. The service only reaches into
// it for the error class it matches on, so a stand-in is enough here. Loading
// the real client is part of what the integration harness will have to solve.
jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    confirmedSession: { findFirst: jest.fn() },
    availability: { findUnique: jest.fn() },
    confirmedSessionAttendee: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  },
}));
jest.mock("@/lib/authz", () => ({ getCampaignRole: jest.fn() }));
jest.mock("@/lib/google/calendarSyncService", () => ({
  enqueueDeletion: jest.fn(),
  enqueueForSession: jest.fn(),
  enqueueUpdateForSession: jest.fn(),
}));
jest.mock("@/lib/holidayService", () => ({ listHolidays: jest.fn() }));

const findSession = prisma.confirmedSession.findFirst as jest.Mock;
const campaignRole = getCampaignRole as jest.Mock;

/** Returns a "YYYY-MM-DD" date `days` away from today, in UTC. */
function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Registers a session on `dateIso` as the one the service will load. */
function sessionOn(dateIso: string): void {
  findSession.mockResolvedValue({
    campaignId: "campaign-1",
    date: new Date(`${dateIso}T00:00:00.000Z`),
  });
}

describe("addAttendee — date guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // `canSelfJoin` has always stated this rule, but only the render consulted
  // it: the self-join button sends an empty body, so no schema could reject
  // anything and nothing re-asserted the date server-side.
  it.each([
    ["yesterday", -1],
    ["a week ago", -7],
    ["a year ago", -365],
  ])("refuses a session dated %s", async (_label, offset) => {
    sessionOn(isoDaysFromToday(offset));

    await expect(addAttendee("session-1", "user-1", "user-1")).resolves.toEqual({
      ok: false,
      error: "sessions.errors.past",
    });
  });

  it("refuses before checking membership, so it cannot be reached another way", async () => {
    sessionOn(isoDaysFromToday(-1));

    await addAttendee("session-1", "user-1", "user-1");

    expect(campaignRole).not.toHaveBeenCalled();
  });

  it("refuses a DM adding someone else to a past session", async () => {
    sessionOn(isoDaysFromToday(-1));

    await expect(addAttendee("session-1", "target-1", "dm-1")).resolves.toEqual({
      ok: false,
      error: "sessions.errors.past",
    });
    expect(campaignRole).not.toHaveBeenCalled();
  });

  it("lets today's session through to the membership checks", async () => {
    sessionOn(isoDaysFromToday(0));
    campaignRole.mockResolvedValue(null);

    const result = await addAttendee("session-1", "user-1", "user-1");

    expect(campaignRole).toHaveBeenCalled();
    expect(result).not.toEqual({ ok: false, error: "sessions.errors.past" });
  });

  it("lets a future session through to the membership checks", async () => {
    sessionOn(isoDaysFromToday(7));
    campaignRole.mockResolvedValue(null);

    await addAttendee("session-1", "user-1", "user-1");

    expect(campaignRole).toHaveBeenCalled();
  });
});
