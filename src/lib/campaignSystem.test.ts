import { createCampaign, listSystemOptions, updateCampaign } from "@/lib/campaignService";
import { prisma } from "@/lib/prisma";
import { campaignSchema } from "@/lib/validation/campaign";

// campaignService reads today's date through @/lib/today, which validates the environment.
jest.mock("@/lib/today", () => ({ todayIso: () => "2026-10-25" }));
jest.mock("@/lib/env", () => ({ env: { APP_TIMEZONE: "Europe/Madrid" } }));

// The generated Prisma client is ESM and uses `import.meta.url`, which ts-jest
// cannot parse — same stand-in as the other service tests.
jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/generated/prisma/enums", () => ({ CampaignRole: { DM: "DM", PLAYER: "PLAYER" } }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    roleSystem: { findFirst: jest.fn(), findMany: jest.fn() },
    campaign: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    diceEvent: { count: jest.fn() },
  },
}));

const db = prisma as unknown as {
  $transaction: jest.Mock;
  roleSystem: { findFirst: jest.Mock; findMany: jest.Mock };
  campaign: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  diceEvent: { count: jest.Mock };
};

const base = { name: "Academia", tag: "AC", description: null };

describe("campaignSchema systemId", () => {
  it("leaves it out when absent, and turns a blank into none", () => {
    expect(campaignSchema.parse(base).systemId).toBeUndefined();
    expect(campaignSchema.parse({ ...base, systemId: "" }).systemId).toBeNull();
    expect(campaignSchema.parse({ ...base, systemId: " s1 " }).systemId).toBe("s1");
  });
});

describe("campaignSchema showDmRolls", () => {
  it("is an optional boolean", () => {
    expect(campaignSchema.parse(base).showDmRolls).toBeUndefined();
    expect(campaignSchema.parse({ ...base, showDmRolls: true }).showDmRolls).toBe(true);
    expect(campaignSchema.safeParse({ ...base, showDmRolls: "yes" }).success).toBe(false);
  });
});

describe("createCampaign", () => {
  let tx: { campaign: { findMany: jest.Mock; create: jest.Mock } };

  beforeEach(() => {
    jest.resetAllMocks();
    tx = { campaign: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: "c1" }) } };
    db.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("stores the chosen system when it exists and is active", async () => {
    db.roleSystem.findFirst.mockResolvedValue({ id: "s1" });

    await expect(createCampaign("david", { ...base, systemId: "s1" })).resolves.toEqual({ ok: true, campaignId: "c1" });

    expect(db.roleSystem.findFirst).toHaveBeenCalledWith({ where: { id: "s1", active: true }, select: { id: true } });
    expect(tx.campaign.create.mock.calls[0][0].data.systemId).toBe("s1");
  });

  it("refuses a system that does not exist or is inactive", async () => {
    db.roleSystem.findFirst.mockResolvedValue(null);

    await expect(createCampaign("david", { ...base, systemId: "nope" })).resolves.toEqual({
      ok: false,
      error: "campaigns.errors.systemInvalid",
    });
    expect(tx.campaign.create).not.toHaveBeenCalled();
  });

  it("starts with the DMs' rolls hidden, unless asked to show them", async () => {
    await createCampaign("david", base);
    expect(tx.campaign.create.mock.calls[0][0].data.showDmRolls).toBe(false);

    await createCampaign("david", { ...base, showDmRolls: true });
    expect(tx.campaign.create.mock.calls[1][0].data.showDmRolls).toBe(true);
  });

  it("creates a campaign with no system when none is given", async () => {
    await createCampaign("david", base);

    expect(db.roleSystem.findFirst).not.toHaveBeenCalled();
    expect(tx.campaign.create.mock.calls[0][0].data.systemId).toBeNull();
  });
});

describe("updateCampaign systemId", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.campaign.findUnique.mockResolvedValue({ systemId: "s1" });
    db.campaign.update.mockResolvedValue({ id: "c1" });
    db.roleSystem.findFirst.mockResolvedValue({ id: "s2" });
    db.diceEvent.count.mockResolvedValue(0);
  });

  it("leaves the system alone when the payload does not mention it", async () => {
    await updateCampaign("c1", base);

    expect(db.campaign.findUnique).not.toHaveBeenCalled();
    expect(db.campaign.update.mock.calls[0][0].data).not.toHaveProperty("systemId");
  });

  it("changes it while the campaign has no entries", async () => {
    await expect(updateCampaign("c1", { ...base, systemId: "s2" })).resolves.toEqual({ ok: true, campaignId: "c1" });

    expect(db.campaign.update.mock.calls[0][0].data.systemId).toBe("s2");
  });

  it("locks the system once the campaign has entries", async () => {
    db.diceEvent.count.mockResolvedValue(3);

    await expect(updateCampaign("c1", { ...base, systemId: "s2" })).resolves.toEqual({
      ok: false,
      error: "campaigns.errors.systemLocked",
    });
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  it("lets a campaign with entries save while keeping the same system", async () => {
    db.diceEvent.count.mockResolvedValue(3);

    await expect(updateCampaign("c1", { ...base, systemId: "s1" })).resolves.toMatchObject({ ok: true });
    expect(db.diceEvent.count).not.toHaveBeenCalled();
  });

  it("refuses an unknown or inactive system, and can clear it", async () => {
    db.roleSystem.findFirst.mockResolvedValue(null);
    await expect(updateCampaign("c1", { ...base, systemId: "nope" })).resolves.toEqual({
      ok: false,
      error: "campaigns.errors.systemInvalid",
    });

    await expect(updateCampaign("c1", { ...base, systemId: null })).resolves.toMatchObject({ ok: true });
    expect(db.campaign.update.mock.calls[0][0].data.systemId).toBeNull();
  });
});

describe("updateCampaign showDmRolls", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.campaign.update.mockResolvedValue({ id: "c1" });
  });

  it("changes it when sent and leaves it alone when omitted", async () => {
    await updateCampaign("c1", { ...base, showDmRolls: true });
    expect(db.campaign.update.mock.calls[0][0].data.showDmRolls).toBe(true);

    await updateCampaign("c1", { ...base, showDmRolls: false });
    expect(db.campaign.update.mock.calls[1][0].data.showDmRolls).toBe(false);

    await updateCampaign("c1", base);
    expect(db.campaign.update.mock.calls[2][0].data).not.toHaveProperty("showDmRolls");
  });
});

describe("listSystemOptions", () => {
  it("offers the active systems plus the campaign's current one", async () => {
    db.roleSystem.findMany.mockResolvedValue([]);

    await listSystemOptions("old");

    expect(db.roleSystem.findMany.mock.calls[0][0].where).toEqual({ OR: [{ active: true }, { id: "old" }] });
  });
});
