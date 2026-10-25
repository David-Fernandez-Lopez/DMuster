import { formatSessionTime } from "@/lib/sessionTime";

/** Echoes the key, so the assertions read the translation keys used. */
const t = (key: string) => key;

describe("formatSessionTime", () => {
  it("labels a session with no start time as all day", () => {
    expect(formatSessionTime({ startTime: null, durationMinutes: null }, t)).toBe(
      "sessions.allDay",
    );
  });

  it("shows just the start time when there is no duration", () => {
    expect(formatSessionTime({ startTime: "17:00", durationMinutes: null }, t)).toBe(
      "17:00",
    );
  });

  it("shows the start time and duration when both are set", () => {
    expect(formatSessionTime({ startTime: "17:00", durationMinutes: 240 }, t)).toBe(
      "17:00 · 240 sessions.durationUnit",
    );
  });
});
