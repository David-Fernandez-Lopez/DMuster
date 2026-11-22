import {
  availablePeriods,
  inPeriod,
  monthKeys,
  parsePeriod,
  periodBounds,
} from "./period";

const TODAY = "2026-10-28";

describe("parsePeriod", () => {
  it("accepts all, last12 and a four-digit year", () => {
    expect(parsePeriod("all")).toBe("all");
    expect(parsePeriod("last12")).toBe("last12");
    expect(parsePeriod("2025")).toBe("2025");
  });

  it("falls back to all for anything else", () => {
    expect(parsePeriod(undefined)).toBe("all");
    expect(parsePeriod("20255")).toBe("all");
    expect(parsePeriod("nonsense")).toBe("all");
    expect(parsePeriod(["last12", "2024"])).toBe("last12");
  });
});

describe("periodBounds", () => {
  it("runs 'all' from the first data month to the current one", () => {
    const bounds = periodBounds("all", TODAY, "2025-09-12");
    expect(bounds).toEqual({
      from: "2025-09-01",
      to: TODAY,
      firstMonth: "2025-09",
      lastMonth: "2026-10",
    });
    expect(monthKeys(bounds)).toHaveLength(14);
  });

  it("covers twelve months for last12", () => {
    const bounds = periodBounds("last12", TODAY, null);
    expect(bounds.firstMonth).toBe("2025-11");
    expect(bounds.lastMonth).toBe("2026-10");
    expect(monthKeys(bounds)).toHaveLength(12);
  });

  it("covers January to December for a year but stops at today", () => {
    const current = periodBounds("2026", TODAY, null);
    expect(current.firstMonth).toBe("2026-01");
    expect(current.lastMonth).toBe("2026-12");
    expect(current.to).toBe(TODAY);
    expect(periodBounds("2025", TODAY, null).to).toBe("2025-12-31");
  });

  it("falls back to today's month when there is no data", () => {
    expect(periodBounds("all", TODAY, null).firstMonth).toBe("2026-10");
  });
});

describe("inPeriod / availablePeriods", () => {
  it("includes both ends", () => {
    const bounds = periodBounds("2025", TODAY, null);
    expect(inPeriod("2025-01-01", bounds)).toBe(true);
    expect(inPeriod("2025-12-31", bounds)).toBe(true);
    expect(inPeriod("2026-01-01", bounds)).toBe(false);
  });

  it("lists years most recent first after all and last12", () => {
    expect(availablePeriods([2025, 2026, 2025])).toEqual([
      "all",
      "last12",
      "2026",
      "2025",
    ]);
  });
});
