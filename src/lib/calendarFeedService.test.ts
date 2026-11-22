jest.mock("@/generated/prisma/client", () => ({}));
jest.mock("@/lib/env", () => ({
  env: { AUTH_URL: "https://dmuster.example/", APP_TIMEZONE: "Europe/Madrid" },
}));
jest.mock("@/lib/today", () => ({ todayIso: () => "2026-11-17" }));
jest.mock("@/lib/holidayService", () => ({ listHolidays: jest.fn() }));
jest.mock("@/lib/confirmedSessionService", () => ({ ACTIVE_SESSION: { cancelledAt: null } }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    confirmedSession: { findMany: jest.fn() },
    availability: { findMany: jest.fn() },
    campaignPlayer: { findFirst: jest.fn() },
  },
}));

import { listHolidays } from "@/lib/holidayService";
import { prisma } from "@/lib/prisma";
import {
  buildFeedUrl,
  ensureFeedToken,
  FEED_HISTORY_DAYS,
  getFeedForToken,
  getFeedUrlForUser,
  isFeedTokenShape,
  regenerateFeedToken,
} from "@/lib/calendarFeedService";

const db = prisma as unknown as {
  user: { findUnique: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
  confirmedSession: { findMany: jest.Mock };
  availability: { findMany: jest.Mock };
  campaignPlayer: { findFirst: jest.Mock };
};

const TOKEN = "A".repeat(43);

/** A December with every eligible day answered, so no reminder is due. */
const DECEMBER_ELIGIBLE_ANSWERS = [
  "2026-12-04", "2026-12-05", "2026-12-06", "2026-12-11", "2026-12-12", "2026-12-13",
  "2026-12-18", "2026-12-19", "2026-12-20", "2026-12-25", "2026-12-26", "2026-12-27",
].map((iso) => ({ date: new Date(`${iso}T00:00:00.000Z`) }));

beforeEach(() => {
  jest.resetAllMocks();
  (listHolidays as jest.Mock).mockResolvedValue([]);
  db.campaignPlayer.findFirst.mockResolvedValue({ campaignId: "c1" });
  db.confirmedSession.findMany.mockResolvedValue([]);
  db.availability.findMany.mockResolvedValue([]);
});

describe("isFeedTokenShape", () => {
  it("accepts a 43-character base64url token", () => {
    expect(isFeedTokenShape(TOKEN)).toBe(true);
  });

  it.each(["", "short", `${TOKEN}x`, `${"A".repeat(42)}!`, `${TOKEN}.ics`])(
    "rejects %p",
    (value) => {
      expect(isFeedTokenShape(value)).toBe(false);
    },
  );
});

describe("buildFeedUrl", () => {
  it("builds the URL from AUTH_URL without a doubled slash", () => {
    expect(buildFeedUrl(TOKEN)).toBe(`https://dmuster.example/api/calendar/${TOKEN}.ics`);
  });
});

describe("getFeedUrlForUser", () => {
  it("returns null when the user has no token", async () => {
    db.user.findUnique.mockResolvedValue({ calendarFeedToken: null });

    await expect(getFeedUrlForUser("u1")).resolves.toBeNull();
  });

  it("returns the URL when they do", async () => {
    db.user.findUnique.mockResolvedValue({ calendarFeedToken: TOKEN });

    await expect(getFeedUrlForUser("u1")).resolves.toBe(buildFeedUrl(TOKEN));
  });
});

describe("ensureFeedToken", () => {
  it("keeps an existing token without writing", async () => {
    db.user.findUnique.mockResolvedValue({ calendarFeedToken: TOKEN });

    await expect(ensureFeedToken("u1")).resolves.toBe(TOKEN);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("creates a token only while none exists", async () => {
    db.user.findUnique.mockResolvedValue({ calendarFeedToken: null });
    db.user.updateMany.mockResolvedValue({ count: 1 });

    const token = await ensureFeedToken("u1");

    expect(isFeedTokenShape(token)).toBe(true);
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", calendarFeedToken: null },
      data: { calendarFeedToken: token },
    });
  });

  it("returns the winner's token when a concurrent call got there first", async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ calendarFeedToken: null })
      .mockResolvedValueOnce({ calendarFeedToken: TOKEN });
    db.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(ensureFeedToken("u1")).resolves.toBe(TOKEN);
  });
});

describe("regenerateFeedToken", () => {
  it("stores and returns a fresh token", async () => {
    db.user.update.mockResolvedValue({});

    const token = await regenerateFeedToken("u1");

    expect(isFeedTokenShape(token)).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { calendarFeedToken: token },
    });
  });
});

describe("getFeedForToken", () => {
  it("returns null for a malformed token without querying", async () => {
    await expect(getFeedForToken("nope")).resolves.toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when no user has that token", async () => {
    db.user.findUnique.mockResolvedValue(null);

    await expect(getFeedForToken(TOKEN)).resolves.toBeNull();
  });

  it("returns null for a disabled account", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", locale: "es", disabledAt: new Date() });

    await expect(getFeedForToken(TOKEN)).resolves.toBeNull();
    expect(db.confirmedSession.findMany).not.toHaveBeenCalled();
  });

  it("queries only active sessions the user attends, from the history window", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", locale: "es", disabledAt: null });
    db.availability.findMany.mockResolvedValue(DECEMBER_ELIGIBLE_ANSWERS);

    await getFeedForToken(TOKEN);

    const where = db.confirmedSession.findMany.mock.calls[0][0].where;
    expect(where.cancelledAt).toBeNull();
    expect(where.attendees).toEqual({ some: { userId: "u1" } });
    // 2026-11-17 minus the history window.
    expect(FEED_HISTORY_DAYS).toBe(90);
    expect(where.date.gte.toISOString()).toBe("2026-08-19T00:00:00.000Z");
  });

  it("serializes sessions, naming who plays online", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", locale: "es", disabledAt: null });
    db.confirmedSession.findMany.mockResolvedValue([
      {
        id: "s1",
        date: new Date("2026-11-20T00:00:00.000Z"),
        startTime: "21:00",
        durationMinutes: 180,
        updatedAt: new Date("2026-11-16T09:00:00.000Z"),
        campaign: { name: "Academia" },
        attendees: [
          { userId: "u1", user: { name: "Ana" } },
          { userId: "u2", user: { name: "Luis" } },
        ],
      },
    ]);
    // First availability query is the ONLINE lookup, the second the reminder's answers.
    db.availability.findMany
      .mockResolvedValueOnce([{ date: new Date("2026-11-20T00:00:00.000Z"), userId: "u2" }])
      .mockResolvedValue(DECEMBER_ELIGIBLE_ANSWERS);

    const ics = (await getFeedForToken(TOKEN)) as string;

    expect(ics).toContain("UID:session-s1@dmuster");
    expect(ics).toContain("SUMMARY:Academia (Online)");
    expect(ics).toContain("DTSTART:20261120T200000Z");
    expect(ics).toContain("Online: Luis");
    expect(ics).not.toContain("reminder-");
  });

  it("adds the reminder when next month has unanswered eligible days", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", locale: "es", disabledAt: null });
    db.availability.findMany.mockResolvedValue([]);

    const ics = (await getFeedForToken(TOKEN)) as string;

    expect(ics).toContain("UID:reminder-2026-12-u1@dmuster");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261130");
    expect(ics).toContain("SUMMARY:REVISAR CALENDARIO ROL");
  });

  it("skips the reminder for someone who belongs to no campaign", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", locale: "es", disabledAt: null });
    db.campaignPlayer.findFirst.mockResolvedValue(null);

    const ics = (await getFeedForToken(TOKEN)) as string;

    expect(ics).not.toContain("VEVENT");
  });

  it("returns an empty but valid calendar when nothing applies", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", locale: "en", disabledAt: null });
    db.availability.findMany.mockResolvedValue(DECEMBER_ELIGIBLE_ANSWERS);

    const ics = (await getFeedForToken(TOKEN)) as string;

    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:DMuster: my sessions");
    expect(ics).not.toContain("VEVENT");
  });
});
