import {
  isEligible,
  isValidIsoDate,
  isWeekend,
  toIsoDate,
  toUtcDate,
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

describe("isEligible", () => {
  it("is eligible on a weekend not listed as a holiday", () => {
    expect(isEligible("2026-07-18", SEED_HOLIDAYS)).toBe(true);
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
