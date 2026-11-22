import { getCampaignRole } from "@/lib/authz";
import { setCampaignArchived } from "@/lib/campaignService";
import { cancelSession, confirmSession } from "@/lib/confirmedSessionService";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/today", () => ({ todayIso: () => "2026-10-25" }));
jest.mock("@/lib/env", () => ({ env: { APP_TIMEZONE: "Europe/Madrid" } }));
jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findUnique: jest.fn(), update: jest.fn() },
    confirmedSession: { findFirst: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  },
}));
jest.mock("@/lib/authz", () => ({ getCampaignRole: jest.fn() }));
jest.mock("@/lib/holidayService", () => ({ listHolidays: jest.fn() }));

const role = getCampaignRole as jest.Mock;
const findCampaign = prisma.campaign.findUnique as jest.Mock;
const updateCampaign = prisma.campaign.update as jest.Mock;
const findSession = prisma.confirmedSession.findFirst as jest.Mock;
const updateSessions = prisma.confirmedSession.updateMany as jest.Mock;
const countSessions = prisma.confirmedSession.count as jest.Mock;

beforeEach(() => jest.resetAllMocks());

describe("setCampaignArchived", () => {
  it("archives an active campaign with no upcoming sessions", async () => {
    findCampaign.mockResolvedValue({ archivedAt: null });
    countSessions.mockResolvedValue(0);

    const result = await setCampaignArchived("ac", true);

    expect(result).toEqual({ ok: true, campaignId: "ac" });
    expect(updateCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: expect.any(Date) } }),
    );
  });

  it("refuses to archive while upcoming sessions are active", async () => {
    findCampaign.mockResolvedValue({ archivedAt: null });
    countSessions.mockResolvedValue(2);

    const result = await setCampaignArchived("ac", true);

    expect(result).toEqual({
      ok: false,
      error: "campaigns.errors.hasUpcomingSessions",
    });
    expect(updateCampaign).not.toHaveBeenCalled();
  });

  it("refuses to archive twice and to unarchive an active campaign", async () => {
    findCampaign.mockResolvedValue({ archivedAt: new Date() });
    expect(await setCampaignArchived("ac", true)).toEqual({
      ok: false,
      error: "campaigns.errors.alreadyArchived",
    });

    findCampaign.mockResolvedValue({ archivedAt: null });
    expect(await setCampaignArchived("ac", false)).toEqual({
      ok: false,
      error: "campaigns.errors.notArchived",
    });
  });

  it("unarchives by clearing archivedAt", async () => {
    findCampaign.mockResolvedValue({ archivedAt: new Date() });

    const result = await setCampaignArchived("ac", false);

    expect(result.ok).toBe(true);
    expect(updateCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: null } }),
    );
  });

  it("reports a missing campaign", async () => {
    findCampaign.mockResolvedValue(null);
    expect(await setCampaignArchived("x", true)).toEqual({
      ok: false,
      error: "campaigns.errors.notFound",
    });
  });
});

describe("confirmSession on an archived campaign", () => {
  it("is refused for a DM", async () => {
    findCampaign.mockResolvedValue({
      name: "Academia",
      tag: "AC",
      minPlayers: null,
      requirementsSetAt: null,
      archivedAt: new Date(),
      players: [{ userId: "dm", role: "DM", optional: false, alwaysOptional: false }],
    });

    const result = await confirmSession({
      campaignId: "ac",
      dateIso: "2026-10-31",
      startTime: null,
      durationMinutes: null,
      userId: "dm",
    });

    expect(result).toEqual({ ok: false, error: "sessions.errors.campaignArchived" });
  });
});

describe("cancelSession with a cause", () => {
  beforeEach(() => {
    findSession.mockResolvedValue({
      campaignId: "ac",
      campaign: { name: "Academia", tag: "AC" },
    });
    updateSessions.mockResolvedValue({ count: 1 });
  });

  it("stores the cause when they belong to the campaign", async () => {
    role.mockImplementation(async (userId: string) =>
      userId === "dm" ? "DM" : "PLAYER",
    );

    const result = await cancelSession("s1", "dm", "ana");

    expect(result).toEqual({ ok: true, id: "s1" });
    expect(updateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancelCauseUserId: "ana" }),
      }),
    );
  });

  it("rejects a cause outside the campaign", async () => {
    role.mockImplementation(async (userId: string) =>
      userId === "dm" ? "DM" : null,
    );

    const result = await cancelSession("s1", "dm", "stranger");

    expect(result).toEqual({
      ok: false,
      error: "sessions.errors.invalidCancelCause",
    });
    expect(updateSessions).not.toHaveBeenCalled();
  });

  it("stores no cause by default", async () => {
    role.mockResolvedValue("DM");

    await cancelSession("s1", "dm");

    expect(updateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancelCauseUserId: null }),
      }),
    );
  });
});
