import { createCampaignArc, deleteCampaignArc, updateCampaignArc } from "@/lib/campaignArcService";
import { prisma } from "@/lib/prisma";
import { lockRow } from "@/lib/rowLock";

jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/rowLock", () => ({ lockRow: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { $transaction: jest.fn(), campaignArc: { updateMany: jest.fn(), deleteMany: jest.fn() } },
}));

const db = prisma as unknown as {
  $transaction: jest.Mock;
  campaignArc: { updateMany: jest.Mock; deleteMany: jest.Mock };
};

describe("createCampaignArc", () => {
  let tx: { campaignArc: { aggregate: jest.Mock; create: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      campaignArc: {
        aggregate: jest.fn().mockResolvedValue({ _max: { number: 2 } }),
        create: jest.fn().mockResolvedValue({ id: "a3" }),
      },
    };
    db.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("numbers the arc after the highest one, under the campaign lock", async () => {
    await expect(createCampaignArc("academia", { name: "Saevis" })).resolves.toEqual({ ok: true, arcId: "a3" });

    expect(lockRow).toHaveBeenCalledWith(tx, "campaign", "academia");
    expect(tx.campaignArc.create).toHaveBeenCalledWith({
      data: { campaignId: "academia", number: 3, name: "Saevis" },
      select: { id: true },
    });
  });

  it("starts at 1 when the campaign has no arcs", async () => {
    tx.campaignArc.aggregate.mockResolvedValue({ _max: { number: null } });

    await createCampaignArc("academia", {});

    expect(tx.campaignArc.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { campaignId: "academia", number: 1, name: null } }),
    );
  });
});

describe("updateCampaignArc / deleteCampaignArc", () => {
  beforeEach(() => jest.clearAllMocks());

  it("scopes both to the campaign so a foreign arc id is not found", async () => {
    db.campaignArc.updateMany.mockResolvedValue({ count: 0 });
    db.campaignArc.deleteMany.mockResolvedValue({ count: 0 });

    await expect(updateCampaignArc("academia", "x", { name: "n" })).resolves.toEqual({
      ok: false,
      error: "arcs.errors.notFound",
    });
    await expect(deleteCampaignArc("academia", "x")).resolves.toEqual({
      ok: false,
      error: "arcs.errors.notFound",
    });
    expect(db.campaignArc.deleteMany).toHaveBeenCalledWith({ where: { id: "x", campaignId: "academia" } });
  });

  it("succeeds when the arc is there", async () => {
    db.campaignArc.updateMany.mockResolvedValue({ count: 1 });
    db.campaignArc.deleteMany.mockResolvedValue({ count: 1 });

    await expect(updateCampaignArc("academia", "a1", { name: null })).resolves.toEqual({ ok: true, arcId: "a1" });
    await expect(deleteCampaignArc("academia", "a1")).resolves.toEqual({ ok: true, arcId: "a1" });
  });
});
