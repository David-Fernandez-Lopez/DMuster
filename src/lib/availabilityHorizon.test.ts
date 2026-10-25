import {
  AVAILABILITY_HORIZON_OPTIONS,
  availabilityDays,
  isAvailabilityHorizon,
  MIN_DAYS,
  WINDOW_DAYS,
} from "@/lib/availabilityHorizon";
import { upcomingEligibleDaysThroughMonth } from "@/lib/date";

describe("availabilityDays", () => {
  it("matches the default window for the default horizon", () => {
    // 2026-10-25 is a Sunday; the 16th eligible day is 2026-11-29 and November
    // has no later one, so the default covers October and November.
    const holidays = new Set<string>();
    const days = availabilityDays("2026-10-25", 2, holidays);

    expect(days).toEqual(
      upcomingEligibleDaysThroughMonth("2026-10-25", WINDOW_DAYS, MIN_DAYS, holidays),
    );
    expect(days[days.length - 1]).toBe("2026-11-29");
  });

  it("adds every eligible day of the extra months", () => {
    const days = availabilityDays("2026-10-25", 3, new Set());

    // December 2026 has four Fridays, four Saturdays and four Sundays.
    expect(days).toHaveLength(16 + 12);
    expect(days[16]).toBe("2026-12-04"); // the first Friday after the default
    expect(days[days.length - 1]).toBe("2026-12-27"); // December's last Sunday
  });

  it("reaches the last eligible day of the horizon's final month", () => {
    const days = availabilityDays("2026-10-25", 6, new Set());

    // October through March: 2027-03-31 is a Wednesday, so the list ends on
    // the Sunday before it.
    expect(days[days.length - 1]).toBe("2027-03-28");
    expect(days).not.toContain("2027-04-02");
  });

  it("never shows less than the default window", () => {
    // From Saturday 2026-10-31 the 16th eligible day is 2026-12-05, so the
    // default window already spills into December — past a two-month horizon.
    const holidays = new Set<string>();
    const days = availabilityDays("2026-10-31", 2, holidays);

    expect(days).toEqual(
      upcomingEligibleDaysThroughMonth("2026-10-31", WINDOW_DAYS, MIN_DAYS, holidays),
    );
    expect(days[days.length - 1]).toBe("2026-12-27");
  });

  it("includes weekday holidays inside the extended range only", () => {
    const holidays = new Set(["2027-01-06"]); // Wednesday

    expect(availabilityDays("2026-10-25", 4, holidays)).toContain("2027-01-06");
    expect(availabilityDays("2026-10-25", 3, holidays)).not.toContain("2027-01-06");
  });

  it("keeps the list ascending and free of duplicates", () => {
    const days = availabilityDays("2026-10-25", 12, new Set());

    expect([...days].sort()).toEqual(days);
    expect(new Set(days).size).toBe(days.length);
  });
});

describe("isAvailabilityHorizon", () => {
  it("accepts every supported option", () => {
    for (const months of AVAILABILITY_HORIZON_OPTIONS) {
      expect(isAvailabilityHorizon(months)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const value of [0, 1, 5, 13, 2.5, "6", null, undefined]) {
      expect(isAvailabilityHorizon(value)).toBe(false);
    }
  });
});
