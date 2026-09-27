import {
  eligibleDaysOfMonth,
  groupByYear,
  groupDaysByMonth,
  isEligible,
  isRegularPlayDay,
  isValidIsoDate,
  isWeekend,
  lastDayOfMonth,
  monthDays,
  toIsoDate,
  toIsoDateIn,
  todayIsoIn,
  toUtcDate,
  upcomingEligibleDaysThroughMonth,
} from "@/lib/date";

// Seed holidays (extra weekday-eligible dates, CLAUDE.md §7). 2026-07-15 is a
// Wednesday, so it exercises the "weekday but eligible via holiday" path.
const SEED_HOLIDAYS = new Set(["2026-07-15", "2026-08-06"]);

describe("isWeekend", () => {
  it("is true on Saturday and Sunday", () => {
    expect(isWeekend("2026-07-18")).toBe(true); // Saturday
    expect(isWeekend("2026-07-19")).toBe(true); // Sunday
  });

  it("is false on a weekday", () => {
    expect(isWeekend("2026-07-20")).toBe(false); // Monday
  });
});

describe("isRegularPlayDay", () => {
  it("is true on Friday, Saturday and Sunday", () => {
    expect(isRegularPlayDay("2026-07-17")).toBe(true); // Friday
    expect(isRegularPlayDay("2026-07-18")).toBe(true); // Saturday
    expect(isRegularPlayDay("2026-07-19")).toBe(true); // Sunday
  });

  it("is false from Monday to Thursday", () => {
    expect(isRegularPlayDay("2026-07-20")).toBe(false); // Monday
    expect(isRegularPlayDay("2026-07-16")).toBe(false); // Thursday
  });
});

describe("isEligible", () => {
  it("is eligible on a weekend not listed as a holiday", () => {
    expect(isEligible("2026-07-18", SEED_HOLIDAYS)).toBe(true);
  });

  it("is eligible on a Friday not listed as a holiday", () => {
    expect(isEligible("2026-07-17", SEED_HOLIDAYS)).toBe(true);
  });

  it("is eligible on a weekday listed as a holiday", () => {
    expect(isEligible("2026-07-15", SEED_HOLIDAYS)).toBe(true);
  });

  it("is not eligible on a plain weekday", () => {
    expect(isEligible("2026-07-20", SEED_HOLIDAYS)).toBe(false);
  });
});

describe("isValidIsoDate", () => {
  it("accepts a real calendar day", () => {
    expect(isValidIsoDate("2026-07-18")).toBe(true);
  });

  it("rejects an impossible day", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false);
  });
});

describe("toUtcDate / toIsoDate", () => {
  it("round-trips a calendar day", () => {
    expect(toIsoDate(toUtcDate("2026-08-06"))).toBe("2026-08-06");
  });
});

describe("lastDayOfMonth", () => {
  it("resolves a 31-day month", () => {
    expect(lastDayOfMonth("2026-08")).toBe("2026-08-31");
  });

  it("resolves a 30-day month", () => {
    expect(lastDayOfMonth("2026-09")).toBe("2026-09-30");
  });

  it("resolves February in a non-leap year", () => {
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
  });

  it("resolves February in a leap year", () => {
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
  });
});

describe("monthDays", () => {
  it("lists every day of a 31-day month with no padding into neighboring months", () => {
    const days = monthDays("2026-08");
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("2026-08-01");
    expect(days[days.length - 1]).toBe("2026-08-31");
  });

  it("lists every day of a leap February", () => {
    expect(monthDays("2028-02")).toHaveLength(29);
  });
});

describe("eligibleDaysOfMonth", () => {
  it("includes Fridays and weekends and excludes plain weekdays", () => {
    // August 2026: Fridays 7, 14, 21, 28; Saturdays 1, 8, 15, 22, 29;
    // Sundays 2, 9, 16, 23, 30.
    const eligible = eligibleDaysOfMonth("2026-08", new Set());
    expect(eligible).toContain("2026-08-01");
    expect(eligible).toContain("2026-08-02");
    expect(eligible).toContain("2026-08-07"); // Friday
    expect(eligible).not.toContain("2026-08-03"); // Monday
  });

  it("includes a weekday listed as a holiday", () => {
    const eligible = eligibleDaysOfMonth("2026-08", SEED_HOLIDAYS);
    expect(eligible).toContain("2026-08-06"); // Thursday, seed holiday
  });
});

describe("upcomingEligibleDaysThroughMonth", () => {
  it("extends past minDays to cover the rest of the last day's month", () => {
    // 2026-09-27 is a Sunday; the 10th Friday/weekend/holiday day from there
    // lands on 2026-10-17, mid-October. The result should keep going through
    // the rest of October's eligible days instead of cutting the month in half.
    const holidays = new Set(["2026-10-12"]); // Monday, made eligible
    const days = upcomingEligibleDaysThroughMonth(
      "2026-09-27",
      90,
      10,
      holidays,
    );

    expect(days.length).toBeGreaterThan(10);
    expect(days[9]).toBe("2026-10-17"); // the original 10th day, unchanged
    expect(days[days.length - 1]).toBe("2026-10-31"); // October's last Saturday
    expect(days).not.toContain("2026-11-01"); // Sunday, but past the month
  });

  it("adds nothing when the minDays cut already lands on the month's last eligible day", () => {
    // Starting on Sunday 2026-11-01 with minDays=13 collects every Friday and
    // weekend through 2026-11-29; November's only later day, 2026-11-30, is a
    // Monday and not eligible, so there is nothing left to extend.
    const days = upcomingEligibleDaysThroughMonth(
      "2026-11-01",
      90,
      13,
      new Set(),
    );

    expect(days).toHaveLength(13);
    expect(days[days.length - 1]).toBe("2026-11-29");
  });

  it("never scans past the window even if the month is not finished", () => {
    const days = upcomingEligibleDaysThroughMonth(
      "2026-09-27",
      10, // window ends 2026-10-06
      2,
      new Set(),
    );

    expect(days).toEqual(["2026-09-27", "2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("returns an empty list unchanged when no eligible day exists in the window", () => {
    expect(upcomingEligibleDaysThroughMonth("2026-09-28", 3, 5, new Set())).toEqual(
      [],
    );
  });
});

describe("groupDaysByMonth", () => {
  it("returns an empty array for an empty input", () => {
    expect(groupDaysByMonth([])).toEqual([]);
  });

  it("groups consecutive days by month, including across a year boundary", () => {
    const groups = groupDaysByMonth([
      "2026-12-26",
      "2026-12-27",
      "2027-01-02",
    ]);

    expect(groups).toEqual([
      { month: "2026-12", days: ["2026-12-26", "2026-12-27"] },
      { month: "2027-01", days: ["2027-01-02"] },
    ]);
  });
});

describe("groupByYear", () => {
  it("returns an empty array for an empty input", () => {
    expect(groupByYear([])).toEqual([]);
  });

  it("groups dated items by year, keeping order and the original objects", () => {
    const dec8 = { id: "a", date: "2026-12-08" };
    const dec25 = { id: "b", date: "2026-12-25" };
    const jan1 = { id: "c", date: "2027-01-01" };

    const groups = groupByYear([dec8, dec25, jan1]);

    expect(groups).toHaveLength(2);
    expect(groups[0].year).toBe("2026");
    expect(groups[0].items[0]).toBe(dec8);
    expect(groups[0].items[1]).toBe(dec25);
    expect(groups[1].year).toBe("2027");
    expect(groups[1].items).toEqual([jan1]);
  });
});

describe("toIsoDateIn", () => {
  // The window this exists for. Madrid runs UTC+2 in summer, so from local
  // midnight until 02:00 the UTC clock still reads the previous day — and that
  // is exactly when a role-playing group is awake and using the app.
  it("gives the local civil day just after midnight in summer", () => {
    const justAfterLocalMidnight = new Date("2026-08-26T22:30:00.000Z");

    expect(toIsoDateIn(justAfterLocalMidnight, "Europe/Madrid")).toBe("2026-08-27");
    expect(toIsoDate(justAfterLocalMidnight)).toBe("2026-08-26"); // what UTC said
  });

  it("gives the local civil day just after midnight in winter", () => {
    // UTC+1 in January, so the disagreement window is one hour instead of two.
    const justAfterLocalMidnight = new Date("2026-01-14T23:30:00.000Z");

    expect(toIsoDateIn(justAfterLocalMidnight, "Europe/Madrid")).toBe("2026-01-15");
    expect(toIsoDate(justAfterLocalMidnight)).toBe("2026-01-14");
  });

  it("agrees with the UTC reading during the rest of the day", () => {
    const midMorning = new Date("2026-08-27T09:00:00.000Z");

    expect(toIsoDateIn(midMorning, "Europe/Madrid")).toBe(toIsoDate(midMorning));
  });

  it("crosses the other way for a zone behind UTC", () => {
    // 20:00 in New York is already the next day in UTC.
    const evening = new Date("2026-08-28T00:30:00.000Z");

    expect(toIsoDateIn(evening, "America/New_York")).toBe("2026-08-27");
    expect(toIsoDate(evening)).toBe("2026-08-28");
  });

  it("pads single-digit months and days", () => {
    expect(toIsoDateIn(new Date("2026-01-05T12:00:00.000Z"), "Europe/Madrid")).toBe(
      "2026-01-05",
    );
  });

  it("rejects a timezone that is not a real IANA name", () => {
    expect(() => toIsoDateIn(new Date(), "Europe/Madridd")).toThrow(RangeError);
  });
});

describe("todayIsoIn", () => {
  it("returns a well-formed calendar day", () => {
    expect(todayIsoIn("Europe/Madrid")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("can differ from the UTC day, which is the point", () => {
    // Both readings are of the same instant, so they are either equal or one
    // day apart — never more.
    const madrid = todayIsoIn("Europe/Madrid");
    const utc = todayIsoIn("UTC");
    const gap = Math.abs(Date.parse(`${madrid}T00:00:00Z`) - Date.parse(`${utc}T00:00:00Z`));

    expect(gap).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});
