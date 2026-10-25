import { getCampaignRole } from "@/lib/authz";
import { addAttendee, confirmSession } from "@/lib/confirmedSessionService";
import { listHolidays } from "@/lib/holidayService";
import { prisma } from "@/lib/prisma";

/** A Saturday, so it is eligible without any holiday. */
const DATE = "2026-10-31";

jest.mock("@/lib/today", () => ({ todayIso: () => "2026-10-25" }));
jest.mock("@/lib/env", () => ({ env: { APP_TIMEZONE: "Europe/Madrid" } }));

// The generated Prisma client is ESM and uses `import.meta.url`, which ts-jest
// cannot parse under the current CommonJS setup — same stand-in as
// addAttendeeDate.test.ts, only the error class is needed.
jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findUnique: jest.fn() },
    availability: { findMany: jest.fn() },
    confirmedSession: { findMany: jest.fn(), findFirst: jest.fn() },
    confirmedSessionAttendee: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/authz", () => ({ getCampaignRole: jest.fn() }));
jest.mock("@/lib/google/calendarSyncService", () => ({
  enqueueDeletion: jest.fn(),
  enqueueForSession: jest.fn(),
  enqueueUpdateForSession: jest.fn(),
}));
jest.mock("@/lib/holidayService", () => ({ listHolidays: jest.fn() }));

const campaignRole = getCampaignRole as jest.Mock;
const holidays = listHolidays as jest.Mock;
const findCampaign = prisma.campaign.findUnique as jest.Mock;
const findAvailability = prisma.availability.findMany as jest.Mock;
const findSessions = prisma.confirmedSession.findMany as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

/** The transaction client handed to the `$transaction` callback. */
const tx = {
  confirmedSession: { create: jest.fn() },
  confirmedSessionAttendee: { createMany: jest.fn() },
};

/**
 * Registers Academia's active session on `DATE` with the given attendees, in
 * the shape `listActiveSessions` selects from Prisma.
 */
function academiaPlaying(attendeeIds: string[]): void {
  findSessions.mockResolvedValue([
    {
      id: "session-ac",
      campaignId: "academia",
      date: new Date(`${DATE}T00:00:00.000Z`),
      startTime: "17:00",
      durationMinutes: 240,
      campaign: { name: "Academia Arcana", tag: "AC" },
      attendees: attendeeIds.map((userId) => ({ userId, user: { name: userId } })),
    },
  ]);
}

/** Confirms Poulard on `DATE` as its DM, Ana. */
function confirmPoulard(attendeeIds?: string[]) {
  return confirmSession({
    campaignId: "poulard",
    dateIso: DATE,
    startTime: null,
    durationMinutes: null,
    userId: "ana",
    attendeeIds,
  });
}

describe("confirmSession — members busy in another campaign's session", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    holidays.mockResolvedValue([]);
    findCampaign.mockResolvedValue({
      name: "Poulard",
      tag: "PO",
      minPlayers: null,
      requirementsSetAt: null,
      players: [
        { userId: "ana", role: "DM", optional: false, alwaysOptional: false },
        { userId: "paola", role: "PLAYER", optional: false, alwaysOptional: false },
        { userId: "tucho", role: "PLAYER", optional: false, alwaysOptional: false },
      ],
    });
    // Everyone answered Sí: on answers alone, Poulard would be viable (S).
    findAvailability.mockResolvedValue([
      { userId: "ana", status: "YES" },
      { userId: "paola", status: "YES" },
      { userId: "tucho", status: "YES" },
    ]);

    transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
    tx.confirmedSession.create.mockResolvedValue({ id: "session-po" });
  });

  it("treats the day as not viable (B) when a member already plays Academia", async () => {
    academiaPlaying(["paola"]);

    await expect(confirmPoulard()).resolves.toEqual({
      ok: false,
      error: "sessions.errors.attendeesRequired",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("lets the DM force the session without the busy member, flagged as forced", async () => {
    academiaPlaying(["paola"]);

    const result = await confirmPoulard(["ana", "tucho"]);

    expect(result.ok).toBe(true);
    expect(tx.confirmedSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ forced: true }) }),
    );
  });

  it("stays viable when the other session's attendees are not Poulard members", async () => {
    // The lock follows attendees: Academia playing without any Poulard member
    // leaves Poulard free.
    academiaPlaying(["sergio"]);

    const result = await confirmPoulard();

    expect(result.ok).toBe(true);
    expect(tx.confirmedSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ forced: false }) }),
    );
  });

  it("loads the day's sessions once, for both the viability and the conflict check", async () => {
    academiaPlaying(["sergio"]);

    await confirmPoulard();

    expect(findSessions).toHaveBeenCalledTimes(1);
  });

  it("names the blocking campaign even though the DM is not in it", async () => {
    // Ana is not an Academia member; the calendar shows her Academia's session
    // in full, so the conflict error names it too.
    academiaPlaying(["paola"]);

    await expect(confirmPoulard(["ana", "paola"])).resolves.toEqual({
      ok: false,
      error: "sessions.errors.playerConflict",
      params: { campaign: "Academia Arcana", players: "paola" },
    });
    expect(campaignRole).not.toHaveBeenCalled();
  });
});

describe("confirmSession — campaign requirements (roadmap #25)", () => {
  /** Saved on the 20th, before any of the sessions below were confirmed. */
  const SET_AT = new Date("2026-10-20T10:00:00Z");

  /**
   * Arranges Poulard with custom requirements: Paola required, Tucho and
   * Patri optional, at least `minPlayers` players.
   */
  function poulardRequiring(minPlayers: number | null): void {
    findCampaign.mockResolvedValue({
      name: "Poulard",
      tag: "PO",
      minPlayers,
      requirementsSetAt: SET_AT,
      players: [
        { userId: "ana", role: "DM", optional: false, alwaysOptional: false },
        { userId: "paola", role: "PLAYER", optional: false, alwaysOptional: false },
        { userId: "tucho", role: "PLAYER", optional: true, alwaysOptional: false },
        { userId: "patri", role: "PLAYER", optional: true, alwaysOptional: false },
      ],
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();

    holidays.mockResolvedValue([]);
    // No sessions anywhere: no anchor for the requirements, nobody busy.
    findSessions.mockResolvedValue([]);
    transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
    tx.confirmedSession.create.mockResolvedValue({ id: "session-po" });
  });

  it("confirms without forcing when only an optional player said no, signing up the rest", async () => {
    poulardRequiring(2);
    findAvailability.mockResolvedValue([
      { userId: "ana", status: "YES" },
      { userId: "paola", status: "YES" },
      { userId: "tucho", status: "ONLINE" },
      { userId: "patri", status: "NO" },
    ]);

    const result = await confirmPoulard();

    expect(result.ok).toBe(true);
    expect(tx.confirmedSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ forced: false }) }),
    );
    expect(tx.confirmedSessionAttendee.createMany).toHaveBeenCalledWith({
      data: ["ana", "paola", "tucho"].map((userId) => ({ sessionId: "session-po", userId })),
    });
  });

  it("still needs the required player", async () => {
    poulardRequiring(null);
    findAvailability.mockResolvedValue([
      { userId: "ana", status: "YES" },
      { userId: "paola", status: "NO" },
      { userId: "tucho", status: "YES" },
      { userId: "patri", status: "YES" },
    ]);

    await expect(confirmPoulard()).resolves.toEqual({
      ok: false,
      error: "sessions.errors.attendeesRequired",
    });
  });

  it("is not viable while the minimum is not reached", async () => {
    poulardRequiring(3);
    findAvailability.mockResolvedValue([
      { userId: "ana", status: "YES" },
      { userId: "paola", status: "YES" },
      { userId: "tucho", status: "YES" },
      { userId: "patri", status: "NO" },
    ]);

    await expect(confirmPoulard()).resolves.toEqual({
      ok: false,
      error: "sessions.errors.attendeesRequired",
    });
  });

  it("plans days after the session they were set for with the default rule", async () => {
    poulardRequiring(2);
    findAvailability.mockResolvedValue([
      { userId: "ana", status: "YES" },
      { userId: "paola", status: "YES" },
      { userId: "tucho", status: "YES" },
      { userId: "patri", status: "NO" },
    ]);
    // First the anchor lookup — a Poulard session on the 30th, confirmed after
    // the requirements were saved — then the day's sessions (none).
    findSessions
      .mockResolvedValueOnce([
        {
          campaignId: "poulard",
          date: new Date("2026-10-30T00:00:00.000Z"),
          createdAt: new Date("2026-10-22T10:00:00Z"),
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(confirmPoulard()).resolves.toEqual({
      ok: false,
      error: "sessions.errors.attendeesRequired",
    });
  });
});

describe("confirmSession — always-optional players (roadmap #25.2)", () => {
  /**
   * Arranges Poulard with Tucho always optional. `requirementsSetAt` opens a
   * next-session window in which the DM marked him required (`optional: false`).
   */
  function poulardWithTuchoAlwaysOptional(requirementsSetAt: Date | null): void {
    findCampaign.mockResolvedValue({
      name: "Poulard",
      tag: "PO",
      minPlayers: null,
      requirementsSetAt,
      players: [
        { userId: "ana", role: "DM", optional: false, alwaysOptional: false },
        { userId: "paola", role: "PLAYER", optional: false, alwaysOptional: false },
        { userId: "tucho", role: "PLAYER", optional: false, alwaysOptional: true },
      ],
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();

    holidays.mockResolvedValue([]);
    findSessions.mockResolvedValue([]);
    // Tucho, who comes and goes, cannot make it; everyone else can.
    findAvailability.mockResolvedValue([
      { userId: "ana", status: "YES" },
      { userId: "paola", status: "YES" },
      { userId: "tucho", status: "NO" },
    ]);
    transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
    tx.confirmedSession.create.mockResolvedValue({ id: "session-po" });
  });

  it("does not let them block a day, and leaves them out of the session", async () => {
    poulardWithTuchoAlwaysOptional(null);

    const result = await confirmPoulard();

    expect(result.ok).toBe(true);
    expect(tx.confirmedSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ forced: false }) }),
    );
    expect(tx.confirmedSessionAttendee.createMany).toHaveBeenCalledWith({
      data: ["ana", "paola"].map((userId) => ({ sessionId: "session-po", userId })),
    });
  });

  it("blocks when the next-session requirements make them required", async () => {
    poulardWithTuchoAlwaysOptional(new Date("2026-10-20T10:00:00Z"));

    await expect(confirmPoulard()).resolves.toEqual({
      ok: false,
      error: "sessions.errors.attendeesRequired",
    });
  });
});

describe("addAttendee — target busy in another campaign's session", () => {
  const findSession = prisma.confirmedSession.findFirst as jest.Mock;
  const findAttendee = prisma.confirmedSessionAttendee.findUnique as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    findSession.mockResolvedValue({
      campaignId: "poulard",
      date: new Date(`${DATE}T00:00:00.000Z`),
    });
    findAttendee.mockResolvedValue(null);
    // The acting DM's role in Poulard, then the target's.
    campaignRole.mockResolvedValueOnce("DM").mockResolvedValueOnce("PLAYER");
  });

  it("names the blocking campaign, without checking whether the DM belongs to it", async () => {
    academiaPlaying(["paola"]);

    await expect(addAttendee("session-po", "paola", "ana")).resolves.toEqual({
      ok: false,
      error: "sessions.errors.attendeeConflict",
      params: { campaign: "Academia Arcana" },
    });
    // Only the two Poulard checks (actor and target) — no lookup of the DM's
    // role in Academia.
    expect(campaignRole).toHaveBeenCalledTimes(2);
  });
});
