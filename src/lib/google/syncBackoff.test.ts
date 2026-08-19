import { isDueForRetry, MAX_SYNC_ATTEMPTS } from "@/lib/google/syncBackoff";

const NOW = new Date("2026-08-19T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

describe("isDueForRetry", () => {
  it("is due immediately when never attempted", () => {
    expect(isDueForRetry(0, null, NOW)).toBe(true);
  });

  it("is not due before the 1-minute backoff after the 1st attempt", () => {
    expect(isDueForRetry(1, minutesAgo(0.5), NOW)).toBe(false);
  });

  it("is due once the 1-minute backoff has elapsed after the 1st attempt", () => {
    expect(isDueForRetry(1, minutesAgo(1), NOW)).toBe(true);
  });

  it("is not due before the 2-minute backoff after the 2nd attempt", () => {
    expect(isDueForRetry(2, minutesAgo(1.5), NOW)).toBe(false);
  });

  it("is due once the 2-minute backoff has elapsed after the 2nd attempt", () => {
    expect(isDueForRetry(2, minutesAgo(2), NOW)).toBe(true);
  });

  it("doubles again for the 3rd and 4th attempts (4 then 8 minutes)", () => {
    expect(isDueForRetry(3, minutesAgo(3.9), NOW)).toBe(false);
    expect(isDueForRetry(3, minutesAgo(4), NOW)).toBe(true);
    expect(isDueForRetry(4, minutesAgo(7.9), NOW)).toBe(false);
    expect(isDueForRetry(4, minutesAgo(8), NOW)).toBe(true);
  });

  it("is never due once the attempt budget is exhausted, no matter how long ago", () => {
    expect(isDueForRetry(MAX_SYNC_ATTEMPTS, minutesAgo(10_000), NOW)).toBe(false);
  });
});
