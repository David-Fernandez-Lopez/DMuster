import { DEFAULT_REQUIREMENTS_WINDOW } from "@/lib/campaignRequirements";
import {
  loadRequirementWindows,
  setCampaignRequirements,
} from "@/lib/campaignRequirementsService";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/today", () => ({ todayIso: () => "2026-10-25" }));
jest.mock("@/lib/env", () => ({ env: { APP_TIMEZONE: "Europe/Madrid" } }));
jest.mock("@/lib/rowLock", () => ({ lockRow: jest.fn() }));

// The generated Prisma client is ESM and uses `import.meta.url`, which ts-jest
// cannot parse — same stand-in as the other service tests.
jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    confirmedSession: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const transaction = prisma.$transaction as unknown as jest.Mock;
const findSessions = prisma.confirmedSession.findMany as jest.Mock;

let tx: {
  campaignPlayer: { findMany: jest.Mock; updateMany: jest.Mock };
  campaign: { update: jest.Mock };
};

/**
 * Arranges the campaign's players (role PLAYER), as the transaction reads them.
 *
 * @param {string[]} ids - The players' user ids.
 * @param {string[]} [alwaysOptionalIds] - Those marked always optional.
 */
function playersAre(ids: string[], alwaysOptionalIds: string[] = []): void {
  tx.campaignPlayer.findMany.mockResolvedValue(
    ids.map((userId) => ({ userId, alwaysOptional: alwaysOptionalIds.includes(userId) })),
  );
}

describe("setCampaignRequirements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      campaignPlayer: { findMany: jest.fn(), updateMany: jest.fn() },
      campaign: { update: jest.fn() },
    };
    transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("marks the unlisted players optional and stamps the window", async () => {
    playersAre(["cgoob", "patri", "tucho"]);

    await expect(
      setCampaignRequirements("fishing", { requiredUserIds: ["cgoob"], minPlayers: 2 }),
    ).resolves.toEqual({ ok: true });

    expect(tx.campaignPlayer.updateMany).toHaveBeenCalledWith({
      where: { campaignId: "fishing", userId: { notIn: ["patri", "tucho"] } },
      data: { optional: false },
    });
    expect(tx.campaignPlayer.updateMany).toHaveBeenCalledWith({
      where: { campaignId: "fishing", userId: { in: ["patri", "tucho"] } },
      data: { optional: true },
    });
    expect(tx.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { minPlayers: 2, requirementsSetAt: expect.any(Date) },
      }),
    );
  });

  it("accepts a minimum with nobody marked required (any N will do)", async () => {
    playersAre(["cgoob", "patri", "tucho"]);

    await expect(
      setCampaignRequirements("fishing", { requiredUserIds: [], minPlayers: 2 }),
    ).resolves.toEqual({ ok: true });
  });

  it("refuses an id that is not a player of the campaign", async () => {
    playersAre(["cgoob", "patri"]);

    await expect(
      setCampaignRequirements("fishing", { requiredUserIds: ["ana"], minPlayers: null }),
    ).resolves.toEqual({ ok: false, error: "campaigns.requirements.errors.notPlayer" });
    expect(tx.campaign.update).not.toHaveBeenCalled();
  });

  it("refuses a minimum above the number of players", async () => {
    playersAre(["cgoob", "patri"]);

    await expect(
      setCampaignRequirements("fishing", { requiredUserIds: [], minPlayers: 3 }),
    ).resolves.toEqual({ ok: false, error: "campaigns.requirements.errors.minTooHigh" });
  });

  it("refuses requirements that would let the DM play alone", async () => {
    playersAre(["cgoob", "patri"]);

    await expect(
      setCampaignRequirements("fishing", { requiredUserIds: [], minPlayers: null }),
    ).resolves.toEqual({ ok: false, error: "campaigns.requirements.errors.empty" });
    expect(tx.campaign.update).not.toHaveBeenCalled();
  });

  it("stores everyone-required with no minimum as a reset, opening no window", async () => {
    playersAre(["cgoob", "patri"]);

    await expect(
      setCampaignRequirements("fishing", {
        requiredUserIds: ["cgoob", "patri"],
        minPlayers: null,
      }),
    ).resolves.toEqual({ ok: true });
    expect(tx.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { minPlayers: null, requirementsSetAt: null } }),
    );
  });

  it("stores the default with an always-optional player left out as a reset too", async () => {
    playersAre(["cgoob", "patri", "salgado"], ["salgado"]);

    await expect(
      setCampaignRequirements("iceron", {
        requiredUserIds: ["cgoob", "patri"],
        minPlayers: null,
      }),
    ).resolves.toEqual({ ok: true });
    expect(tx.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { minPlayers: null, requirementsSetAt: null } }),
    );
  });

  it("opens a window to require an always-optional player for one session", async () => {
    playersAre(["cgoob", "patri", "salgado"], ["salgado"]);

    await expect(
      setCampaignRequirements("iceron", {
        requiredUserIds: ["cgoob", "patri", "salgado"],
        minPlayers: null,
      }),
    ).resolves.toEqual({ ok: true });
    expect(tx.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { minPlayers: null, requirementsSetAt: expect.any(Date) },
      }),
    );
  });
});

describe("loadRequirementWindows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("skips the query when every campaign uses the default rule", async () => {
    const windows = await loadRequirementWindows([{ id: "orden", requirementsSetAt: null }]);

    expect(windows.get("orden")).toEqual(DEFAULT_REQUIREMENTS_WINDOW);
    expect(findSessions).not.toHaveBeenCalled();
  });

  it("anchors each campaign on its own next session, in one query", async () => {
    findSessions.mockResolvedValue([
      {
        campaignId: "fishing",
        date: new Date("2026-11-07T00:00:00.000Z"),
        createdAt: new Date("2026-10-26T10:00:00Z"),
      },
      {
        campaignId: "poulard",
        date: new Date("2026-10-24T00:00:00.000Z"),
        createdAt: new Date("2026-10-23T10:00:00Z"),
      },
    ]);

    const windows = await loadRequirementWindows([
      { id: "fishing", requirementsSetAt: new Date("2026-10-25T10:00:00Z") },
      { id: "poulard", requirementsSetAt: new Date("2026-10-20T10:00:00Z") },
      { id: "orden", requirementsSetAt: null },
    ]);

    expect(findSessions).toHaveBeenCalledTimes(1);
    expect(windows.get("fishing")).toEqual({ active: true, untilDate: "2026-11-07" });
    // Poulard's session on the 24th already passed: its requirements lapsed.
    expect(windows.get("poulard")).toEqual(DEFAULT_REQUIREMENTS_WINDOW);
    expect(windows.get("orden")).toEqual(DEFAULT_REQUIREMENTS_WINDOW);
  });
});
