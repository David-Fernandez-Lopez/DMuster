import {
  answerKey,
  campaignStats,
  dayTypeOf,
  groupStats,
  meStats,
  rank,
  reliability,
  weekRuns,
  type StatAnswer,
  type StatCampaign,
  type StatContext,
  type StatSession,
} from "./metrics";
import { periodBounds } from "./period";

const TODAY = "2026-10-28";
const HOLIDAYS = new Set(["2026-08-15"]);

/** Builds a played session, overridable field by field. */
function session(overrides: Partial<StatSession> & { id: string; date: string }): StatSession {
  return {
    campaignId: "ac",
    startTime: "17:00",
    durationMinutes: 240,
    status: "PLAYED",
    dmId: "paola",
    attendeeIds: ["paola", "david"],
    forced: false,
    confirmedDay: "2026-01-01",
    cancelledDay: null,
    cancelCauseUserId: null,
    lateJoinerIds: [],
    ...overrides,
  };
}

const members = (ids: string[], dms: string[]) =>
  ids.map((userId) => ({
    userId,
    name: userId[0].toUpperCase() + userId.slice(1),
    isDm: dms.includes(userId),
    joinedDay: "2026-03-01",
  }));

const CAMPAIGNS: StatCampaign[] = [
  {
    id: "ac",
    tag: "AC",
    name: "Academia",
    colorIndex: 0,
    archivedDay: null,
    members: members(["paola", "david", "sergio"], ["paola"]),
    next: { date: "2026-10-31", startTime: "17:00" },
  },
  {
    id: "fi",
    tag: "FI",
    name: "Fishing",
    colorIndex: 4,
    archivedDay: "2026-04-30",
    members: members(["paola", "david"], ["david"]),
    next: null,
  },
];

const names = new Map([
  ["paola", "Paola"],
  ["david", "David"],
  ["sergio", "Sergio"],
]);

/** Context with the given answers. */
function context(answers: [string, string, StatAnswer["status"], string][] = []): StatContext {
  return {
    today: TODAY,
    holidays: HOLIDAYS,
    campaigns: CAMPAIGNS,
    names,
    answers: new Map(
      answers.map(([user, date, status, answeredDay]) => [
        answerKey(user, date),
        { status, answeredDay },
      ]),
    ),
  };
}

const ALL = periodBounds("all", TODAY, "2026-03-06");

describe("rank", () => {
  it("shares a position among ties and skips the next (1, 1, 3)", () => {
    const rows = rank([
      { key: "a", value: 5 },
      { key: "b", value: 5 },
      { key: "c", value: 3 },
      { key: "d", value: 1 },
    ]);
    expect(rows.map((row) => row.position)).toEqual([1, 3]);
    expect(rows[0].items.map((item) => item.key)).toEqual(["a", "b"]);
  });

  it("drops zero values and honours the top limit", () => {
    expect(rank([{ key: "a", value: 0 }])).toEqual([]);
    expect(
      rank([
        { key: "a", value: 3 },
        { key: "b", value: 2 },
      ], 1),
    ).toHaveLength(1);
  });
});

describe("weekRuns", () => {
  it("joins consecutive ISO weeks and reports Monday to Sunday", () => {
    // Fri 2026-05-15, Sat 05-23 (next week), then a gap, then 06-12.
    const runs = weekRuns(["2026-05-15", "2026-05-16", "2026-05-23", "2026-06-12"]);
    expect(runs[0]).toEqual({ weeks: 2, from: "2026-05-11", to: "2026-05-24" });
    expect(runs[1].weeks).toBe(1);
  });

  it("treats Sunday and the following Monday as consecutive weeks", () => {
    expect(weekRuns(["2026-05-17", "2026-05-18"])[0].weeks).toBe(2);
  });
});

describe("dayTypeOf", () => {
  it("lets a holiday win over the weekday", () => {
    expect(dayTypeOf("2026-08-15", HOLIDAYS)).toBe("HOLIDAY"); // a Saturday
    expect(dayTypeOf("2026-08-14", HOLIDAYS)).toBe("FRI");
    expect(dayTypeOf("2026-08-16", HOLIDAYS)).toBe("SUN");
  });
});

describe("reliability", () => {
  it("counts a missing answer as T and averages the lead of answered days", () => {
    // Eligible days 2026-10-02 (Fri) .. 2026-10-04 (Sun): three.
    const result = reliability(
      "david",
      "2026-10-02",
      "2026-10-04",
      context([
        ["david", "2026-10-02", "YES", "2026-09-22"], // 10 days ahead
        ["david", "2026-10-03", "NO", "2026-09-30"], // 3 days ahead
      ]),
    );
    expect(result.eligible).toBe(3);
    expect(result.counts).toEqual({ S: 1, O: 0, T: 1, N: 1 });
    expect(result.responseRate).toBe(67);
    expect(result.leadDays).toBe(7); // (10 + 3) / 2 = 6.5 -> 7
    expect(result.noDays).toBe(1);
  });

  it("counts a stored MAYBE as answered T", () => {
    const result = reliability(
      "david",
      "2026-10-02",
      "2026-10-02",
      context([["david", "2026-10-02", "MAYBE", "2026-10-01"]]),
    );
    expect(result.counts.T).toBe(1);
    expect(result.responseRate).toBe(100);
  });

  it("is all zeros with no eligible day and never negative on a late answer", () => {
    const empty = reliability("david", "2026-10-05", "2026-10-08", context());
    expect(empty.eligible).toBe(0);
    expect(empty.leadDays).toBeNull();

    const late = reliability(
      "david",
      "2026-10-02",
      "2026-10-02",
      context([["david", "2026-10-02", "YES", "2026-10-05"]]),
    );
    expect(late.leadDays).toBe(0);
  });
});

describe("groupStats", () => {
  const sessions: StatSession[] = [
    session({ id: "1", date: "2026-05-15", confirmedDay: "2026-05-09" }),
    session({ id: "2", date: "2026-05-23", confirmedDay: "2026-05-22", attendeeIds: ["paola", "david", "sergio"] }),
    session({ id: "3", date: "2026-06-12", startTime: null, durationMinutes: null }),
    session({ id: "4", date: "2026-03-06", campaignId: "fi", dmId: "david", startTime: "22:00", durationMinutes: 180 }),
    session({ id: "5", date: "2026-10-30", status: "PLAYED" }), // future: ignored
    session({ id: "6", date: "2026-05-30", status: "CANCELED", cancelledDay: "2026-05-29" }),
  ];

  it("counts only played sessions up to today", () => {
    const stats = groupStats(sessions, ALL, context());
    expect(stats.played).toBe(4);
    expect(stats.campaigns).toBe(2);
    expect(stats.players).toBe(3);
    expect(stats.empty).toBe(false);
    expect(stats.few).toBe(true);
  });

  it("sums hours only over timed sessions", () => {
    const stats = groupStats(sessions, ALL, context());
    expect(stats.timedCount).toBe(3);
    expect(stats.hours).toBe(11); // 4h + 4h + 3h
  });

  it("ranks campaigns, DMs and attendance", () => {
    const { fame } = groupStats(sessions, ALL, context());
    expect(fame.campaign[0].items[0].key).toBe("ac");
    expect(fame.dm[0].items.map((item) => item.key)).toEqual(["paola"]);
    // Paola and David both attended all four sessions: a tie for first place.
    expect(fame.attendanceTotal[0].items.map((item) => item.key)).toEqual(["david", "paola"]);
    expect(fame.attendanceTotal[1].position).toBe(3);
    expect(fame.pair[0].items[0].key).toBe("david|paola");
  });

  it("computes attendance % against the sessions of each person's campaigns", () => {
    const { fame } = groupStats(sessions, ALL, context());
    const sergio = fame.attendancePct
      .flatMap((row) => row.items.map((item) => ({ ...item, value: row.value })))
      .find((item) => item.key === "sergio");
    // Sergio belongs to AC only: attended 1 of its 3 played sessions.
    expect(sergio?.meta).toEqual({ attended: 1, of: 3 });
    expect(sergio?.value).toBe(33);
  });

  it("finds each person's best month for the record", () => {
    const { fame } = groupStats(sessions, ALL, context());
    expect(fame.recordMonth[0].value).toBe(2);
    expect(fame.recordMonth[0].items[0].meta).toEqual({ month: "2026-05" });
  });

  it("measures the gap between sessions per campaign and the forgotten one", () => {
    const stats = groupStats(sessions, ALL, context());
    expect(stats.gaps).toEqual([{ campaignId: "ac", days: 14 }]);
    // Fishing is archived, so Academia (last played 2026-06-12) is the forgotten one.
    expect(stats.forgotten).toEqual({ campaignId: "ac", days: 138, lastDate: "2026-06-12" });
  });

  it("describes the rhythm: day of week, schedule and lead time", () => {
    const { rhythm } = groupStats(sessions, ALL, context());
    expect(rhythm.favouriteDay).toBe("FRI");
    expect(rhythm.schedule.modeStart).toBe("17:00");
    expect(rhythm.schedule.eveningPct).toBe(33);
    expect(rhythm.leadBuckets.map((bucket) => bucket.id)).toEqual(["LE2", "D3_7", "GT7"]);
    expect(rhythm.leadBuckets[0].n).toBe(1); // 05-23 confirmed one day ahead
  });

  it("is empty for a period without sessions", () => {
    const stats = groupStats(sessions, periodBounds("2024", TODAY, null), context());
    expect(stats.empty).toBe(true);
    expect(stats.few).toBe(false);
    expect(stats.forgotten).not.toBeNull(); // forgotten ignores the period
  });
});

describe("campaignStats", () => {
  const sessions: StatSession[] = [
    session({ id: "1", date: "2026-05-15", attendeeIds: ["paola", "david", "sergio"] }),
    session({ id: "2", date: "2026-05-22", attendeeIds: ["paola", "david"], forced: true, lateJoinerIds: ["david"] }),
    session({
      id: "3",
      date: "2026-05-29",
      status: "CANCELED",
      cancelledDay: "2026-05-28",
      cancelCauseUserId: "sergio",
    }),
    session({
      id: "4",
      date: "2026-06-05",
      status: "CANCELED",
      cancelledDay: "2026-05-20",
    }),
  ];

  it("returns null for an unknown campaign", () => {
    expect(campaignStats("zz", sessions, ALL, context())).toBeNull();
  });

  it("computes attendance, faithful member (DMs excluded), forced and late joiners", () => {
    const stats = campaignStats("ac", sessions, ALL, context())!;
    expect(stats.played).toBe(2);
    expect(stats.attendancePct).toBe(83); // 5 / (2 * 3)
    expect(stats.faithful?.items.map((item) => item.key)).toEqual(["david"]);
    expect(stats.forced).toBe(1);
    expect(stats.forcedPct).toBe(50);
    expect(stats.lateJoiners).toEqual([{ userId: "david", n: 1 }]);
    expect(stats.lastDate).toBe("2026-05-22");
    expect(stats.next).toEqual({ date: "2026-10-31", startTime: "17:00" });
  });

  it("splits played and cancelled and flags last-minute cancellations", () => {
    const stats = campaignStats("ac", sessions, ALL, context())!;
    expect(stats.canceled).toBe(2);
    expect(stats.playedPct).toBe(50);
    expect(stats.canceledPct).toBe(50);
    expect(stats.lateCancel).toBe(1);
    expect(stats.causes).toEqual([{ userId: "sergio", n: 1 }]);
  });

  it("lists DMs first, then members alphabetically, never by score", () => {
    const stats = campaignStats("ac", sessions, ALL, context())!;
    expect(stats.members.map((member) => member.userId)).toEqual(["paola", "david", "sergio"]);
  });

  it("limits an archived campaign's reliability to its life and hides next", () => {
    const stats = campaignStats("fi", [], ALL, context())!;
    expect(stats.archived).toBe(true);
    expect(stats.next).toBeNull();
    // joined 2026-03-01, archived 2026-04-30: 8 Fri/Sat/Sun weekends' days at most, not up to today.
    const lastEligible = stats.members[0].reliability.eligible;
    expect(lastEligible).toBeGreaterThan(0);
    expect(lastEligible).toBeLessThan(30);
  });

  it("flags few data under five played sessions and empty with nothing at all", () => {
    expect(campaignStats("ac", sessions, ALL, context())!.few).toBe(true);
    expect(campaignStats("ac", [], ALL, context())!.empty).toBe(true);
  });
});

describe("meStats", () => {
  const sessions: StatSession[] = [
    session({ id: "1", date: "2026-05-15", attendeeIds: ["paola", "david", "sergio"] }),
    session({ id: "2", date: "2026-05-22", attendeeIds: ["paola", "sergio"] }),
    session({ id: "3", date: "2026-05-29", campaignId: "fi", dmId: "david", attendeeIds: ["david", "paola"] }),
  ];

  it("splits attendance as player and DM across the user's campaigns", () => {
    const stats = meStats("david", sessions, ALL, context());
    expect(stats.played).toBe(2);
    expect(stats.asDm).toBe(1);
    expect(stats.asPlayer).toBe(1);
    expect(stats.isDm).toBe(true);
    expect(stats.attendancePct).toBe(67); // 2 of 3
    expect(stats.campaigns.map((row) => row.campaignId).sort()).toEqual(["ac", "fi"]);
  });

  it("is not a DM for a player-only user and ranks companions", () => {
    const stats = meStats("sergio", sessions, ALL, context());
    expect(stats.isDm).toBe(false);
    expect(stats.asDm).toBe(0);
    expect(stats.companions[0].items[0].key).toBe("paola");
    expect(stats.companions[0].value).toBe(2);
  });

  it("reports the longest streak of consecutive weeks", () => {
    // Paola attends 05-15, 05-22 and 05-29: three consecutive ISO weeks.
    expect(meStats("paola", sessions, ALL, context()).streak).toEqual({
      weeks: 3,
      from: "2026-05-11",
      to: "2026-05-31",
    });
    // David misses the middle week, so his best run is a single week.
    expect(meStats("david", sessions, ALL, context()).streak?.weeks).toBe(1);
  });

  it("is empty for a period without their sessions", () => {
    expect(meStats("david", sessions, periodBounds("2024", TODAY, null), context()).empty).toBe(true);
  });
});
