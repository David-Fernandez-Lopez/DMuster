import {
  createCampaign,
  listUsedColorSlots,
  updateCampaign,
} from "@/lib/campaignService";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/today", () => ({ todayIso: () => "2026-10-25" }));
jest.mock("@/lib/env", () => ({ env: { APP_TIMEZONE: "Europe/Madrid" } }));

// The generated Prisma client is ESM and uses `import.meta.url`, which ts-jest
// cannot parse under the current CommonJS setup: only the error class is needed.
jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const findMany = prisma.campaign.findMany as jest.Mock;
const findFirst = prisma.campaign.findFirst as jest.Mock;
const update = prisma.campaign.update as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

const tx = { campaign: { findMany: jest.fn(), create: jest.fn() } };

beforeEach(() => {
  jest.resetAllMocks();
  transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
    callback(tx),
  );
});

describe("createCampaign colour", () => {
  const input = { name: "Nueva", tag: "NU", description: null };

  it("takes slot 0 when no campaign exists", async () => {
    tx.campaign.findMany.mockResolvedValue([]);
    tx.campaign.create.mockResolvedValue({ id: "c1" });

    const result = await createCampaign("u1", input);

    expect(result).toEqual({ ok: true, campaignId: "c1" });
    expect(tx.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ colorSlot: 0 }),
      }),
    );
  });

  it("takes the first slot nobody uses, filling a gap before extending", async () => {
    tx.campaign.findMany.mockResolvedValue([
      { colorSlot: 0 },
      { colorSlot: 1 },
      { colorSlot: 3 },
    ]);
    tx.campaign.create.mockResolvedValue({ id: "c2" });

    await createCampaign("u1", input);

    expect(tx.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ colorSlot: 2 }),
      }),
    );
  });
});

describe("updateCampaign colour", () => {
  const base = { name: "Academia", tag: "AC", description: null };

  it("refuses a colour another campaign holds", async () => {
    findFirst.mockResolvedValue({ id: "other" });

    const result = await updateCampaign("c1", { ...base, colorSlot: 4 });

    expect(result).toEqual({ ok: false, error: "campaigns.errors.colorTaken" });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { colorSlot: 4, id: { not: "c1" } } }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("saves a free colour", async () => {
    findFirst.mockResolvedValue(null);

    const result = await updateCampaign("c1", { ...base, colorSlot: 5 });

    expect(result).toEqual({ ok: true, campaignId: "c1" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ colorSlot: 5 }),
      }),
    );
  });

  it("leaves the colour alone when the payload has none", async () => {
    const result = await updateCampaign("c1", base);

    expect(result.ok).toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).not.toHaveProperty("colorSlot");
  });
});

describe("listUsedColorSlots", () => {
  it("maps each slot to the tag of its holder, leaving out the edited campaign", async () => {
    findMany.mockResolvedValue([
      { colorSlot: 0, tag: "AC" },
      { colorSlot: 2, tag: "OR" },
    ]);

    const used = await listUsedColorSlots("c9");

    expect(used).toEqual({ 0: "AC", 2: "OR" });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { not: "c9" } } }),
    );
  });
});
