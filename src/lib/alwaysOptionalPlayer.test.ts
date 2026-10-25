import { setPlayerAlwaysOptional } from "@/lib/campaignPlayerService";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/today", () => ({ todayIso: () => "2026-10-25" }));
jest.mock("@/lib/rowLock", () => ({ lockRow: jest.fn() }));
jest.mock("@/lib/google/calendarSyncService", () => ({
  DISCONNECT_PROCESS_LIMIT: 10,
  enqueueDeletion: jest.fn(),
  enqueueUpdateForSession: jest.fn(),
  processPending: jest.fn(),
}));

// The generated Prisma client is ESM and uses `import.meta.url`, which ts-jest
// cannot parse — same stand-in as the other service tests.
jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({ prisma: { $transaction: jest.fn() } }));

const transaction = prisma.$transaction as unknown as jest.Mock;

let tx: {
  campaignPlayer: { findUnique: jest.Mock; count: jest.Mock; update: jest.Mock };
};

describe("setPlayerAlwaysOptional", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      campaignPlayer: {
        findUnique: jest.fn().mockResolvedValue({ role: "PLAYER" }),
        count: jest.fn().mockResolvedValue(3),
        update: jest.fn(),
      },
    };
    transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("marks a player optional for good, along with the next-session flag", async () => {
    await expect(setPlayerAlwaysOptional("iceron", "salgado", true)).resolves.toEqual({
      ok: true,
    });

    expect(tx.campaignPlayer.update).toHaveBeenCalledWith({
      where: { campaignId_userId: { campaignId: "iceron", userId: "salgado" } },
      data: { alwaysOptional: true, optional: true },
      select: { campaignId: true },
    });
  });

  it("clears it without counting anyone", async () => {
    await expect(setPlayerAlwaysOptional("iceron", "salgado", false)).resolves.toEqual({
      ok: true,
    });

    expect(tx.campaignPlayer.count).not.toHaveBeenCalled();
    expect(tx.campaignPlayer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { alwaysOptional: false, optional: false } }),
    );
  });

  it("refuses to leave the campaign with no required player", async () => {
    tx.campaignPlayer.count.mockResolvedValue(0);

    await expect(setPlayerAlwaysOptional("iceron", "salgado", true)).resolves.toEqual({
      ok: false,
      error: "campaigns.players.errors.lastRequired",
    });
    expect(tx.campaignPlayer.update).not.toHaveBeenCalled();
  });

  it("refuses a DM, who is always required", async () => {
    tx.campaignPlayer.findUnique.mockResolvedValue({ role: "DM" });

    await expect(setPlayerAlwaysOptional("iceron", "cgoob", true)).resolves.toEqual({
      ok: false,
      error: "campaigns.players.errors.notPlayer",
    });
    expect(tx.campaignPlayer.update).not.toHaveBeenCalled();
  });

  it("refuses someone who is not in the campaign", async () => {
    tx.campaignPlayer.findUnique.mockResolvedValue(null);

    await expect(setPlayerAlwaysOptional("iceron", "ana", true)).resolves.toEqual({
      ok: false,
      error: "campaigns.players.errors.notMember",
    });
  });
});
