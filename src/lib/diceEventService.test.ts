import {
  createDiceEvent,
  deleteDiceEvent,
  listAllDiceEvents,
  listDiceEventContext,
  listDiceEvents,
  updateDiceEvent,
} from "@/lib/diceEventService";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/today", () => ({
  todayIso: () => "2026-11-22",
  nowStamp: () => ({ date: "2026-11-22", time: "00:21" }),
}));

// The generated Prisma client is ESM and uses `import.meta.url`, which ts-jest
// cannot parse — same stand-in as the other service tests.
jest.mock("@/generated/prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, code = "P2025") {
      super(message);
      this.code = code;
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } };
});
jest.mock("@/lib/prisma", () => ({
  prisma: {
    diceEvent: { count: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    campaign: { findMany: jest.fn() },
    campaignPlayer: { findUnique: jest.fn() },
    campaignArc: { findFirst: jest.fn() },
    confirmedSession: { findFirst: jest.fn() },
  },
}));

const db = prisma as unknown as {
  diceEvent: Record<"count" | "findMany" | "create" | "update" | "delete", jest.Mock>;
  campaign: { findMany: jest.Mock };
  campaignPlayer: { findUnique: jest.Mock };
  campaignArc: { findFirst: jest.Mock };
  confirmedSession: { findFirst: jest.Mock };
};

const createInput = {
  userId: "paola",
  kind: "FUMBLE" as const,
  skill: "PERCEPCION",
  arcId: null,
  sessionId: null,
};

const input = { ...createInput, date: "2026-11-01", time: "19:20" };

beforeEach(() => {
  jest.clearAllMocks();
  db.campaignPlayer.findUnique.mockResolvedValue({ userId: "paola" });
  db.diceEvent.create.mockResolvedValue({ id: "e1" });
  db.diceEvent.update.mockResolvedValue({ id: "e1" });
  db.diceEvent.delete.mockResolvedValue({ id: "e1" });
});

describe("createDiceEvent", () => {
  it("stores the event with the actor as author, stamped with the current date and time", async () => {
    await expect(createDiceEvent("orden", "david", createInput)).resolves.toEqual({ ok: true, eventId: "e1" });

    expect(db.diceEvent.create).toHaveBeenCalledWith({
      data: {
        campaignId: "orden",
        userId: "paola",
        createdById: "david",
        kind: "FUMBLE",
        skill: "PERCEPCION",
        date: new Date("2026-11-22T00:00:00.000Z"),
        time: "00:21",
        arcId: null,
        sessionId: null,
      },
      select: { id: true },
    });
  });

  it("ignores any date or time the caller smuggles in", async () => {
    await createDiceEvent("orden", "david", { ...createInput, date: "2020-01-01", time: "03:00" } as never);

    expect(db.diceEvent.create.mock.calls[0][0].data).toMatchObject({
      date: new Date("2026-11-22T00:00:00.000Z"),
      time: "00:21",
    });
  });

  it("refuses a player who is not in the campaign", async () => {
    db.campaignPlayer.findUnique.mockResolvedValue(null);

    await expect(createDiceEvent("orden", "david", createInput)).resolves.toEqual({
      ok: false,
      error: "diceEvents.errors.playerNotMember",
    });
    expect(db.diceEvent.create).not.toHaveBeenCalled();
  });

  it("refuses an arc or a session of another campaign", async () => {
    db.campaignArc.findFirst.mockResolvedValue(null);
    await expect(createDiceEvent("orden", "david", { ...createInput, arcId: "x" })).resolves.toEqual({
      ok: false,
      error: "diceEvents.errors.arcNotFound",
    });
    expect(db.campaignArc.findFirst).toHaveBeenCalledWith({ where: { id: "x", campaignId: "orden" }, select: { id: true } });

    db.confirmedSession.findFirst.mockResolvedValue(null);
    await expect(createDiceEvent("orden", "david", { ...createInput, sessionId: "s" })).resolves.toEqual({
      ok: false,
      error: "diceEvents.errors.sessionNotFound",
    });
  });

  it("answers with a safe error when the database fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    db.diceEvent.create.mockRejectedValue(new Error("boom"));

    await expect(createDiceEvent("orden", "david", createInput)).resolves.toEqual({
      ok: false,
      error: "diceEvents.errors.unknown",
    });
  });
});

describe("updateDiceEvent", () => {
  it("refuses a date after today but accepts today", async () => {
    await expect(updateDiceEvent("e1", "orden", { ...input, date: "2026-11-23" })).resolves.toEqual({
      ok: false,
      error: "diceEvents.errors.futureDate",
    });
    await expect(updateDiceEvent("e1", "orden", { ...input, date: "2026-11-22" })).resolves.toMatchObject({ ok: true });
  });

  it("replaces the editable fields and keeps the author", async () => {
    await expect(updateDiceEvent("e1", "orden", input)).resolves.toEqual({ ok: true, eventId: "e1" });

    const data = db.diceEvent.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("createdById");
    expect(data).not.toHaveProperty("campaignId");
  });

  it("maps a missing record to notFound", async () => {
    const { Prisma } = jest.requireMock("@/generated/prisma/client");
    db.diceEvent.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("gone", "P2025"));

    await expect(updateDiceEvent("e1", "orden", input)).resolves.toEqual({
      ok: false,
      error: "diceEvents.errors.notFound",
    });
  });
});

describe("deleteDiceEvent", () => {
  it("deletes by id", async () => {
    await expect(deleteDiceEvent("e1")).resolves.toEqual({ ok: true, eventId: "e1" });
    expect(db.diceEvent.delete).toHaveBeenCalledWith({ where: { id: "e1" }, select: { id: true } });
  });
});

describe("listDiceEvents", () => {
  it("only reads campaigns the viewer belongs to and pages the result", async () => {
    db.diceEvent.count.mockResolvedValue(30);
    db.diceEvent.findMany.mockResolvedValue([]);

    const page = await listDiceEvents("david", { campaignId: "orden", kind: "FUMBLE", page: 2, pageSize: 10 });

    expect(page).toEqual({ items: [], total: 30, page: 2, pageSize: 10 });
    expect(db.diceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          campaign: { players: { some: { userId: "david" } } },
          campaignId: "orden",
          kind: "FUMBLE",
        },
        skip: 10,
        take: 10,
      }),
    );
  });
});

describe("listAllDiceEvents", () => {
  it("reads the whole filtered log oldest first, without paging", async () => {
    db.diceEvent.findMany.mockResolvedValue([]);

    await listAllDiceEvents("david", { campaignId: "orden", userId: "paola", page: 3, pageSize: 10 });

    const args = db.diceEvent.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      campaign: { players: { some: { userId: "david" } } },
      campaignId: "orden",
      userId: "paola",
    });
    expect(args.orderBy[0]).toEqual({ date: "asc" });
    expect(args).not.toHaveProperty("skip");
  });
});

describe("listDiceEventContext", () => {
  it("flattens the viewer's campaigns with their members and arcs", async () => {
    db.campaign.findMany.mockResolvedValue([
      {
        id: "orden",
        name: "La Orden",
        tag: "OR",
        colorSlot: 1,
        players: [{ role: "PLAYER", user: { id: "paola", name: "Paola" } }],
        arcs: [{ id: "a1", number: 1, name: null }],
      },
    ]);

    await expect(listDiceEventContext("david")).resolves.toEqual([
      {
        id: "orden",
        name: "La Orden",
        tag: "OR",
        colorSlot: 1,
        members: [{ userId: "paola", name: "Paola", role: "PLAYER" }],
        arcs: [{ id: "a1", number: 1, name: null }],
      },
    ]);
    expect(db.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { players: { some: { userId: "david" } } } }),
    );
  });
});
