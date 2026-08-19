import { buildCalendarEvent } from "@/lib/google/calendarEvent";

const BASE_INPUT = {
  sessionId: "session-1",
  campaignName: "La Orden del Alba",
  dateIso: "2026-09-05",
  attendeeNames: ["Ana", "David", "Paola"],
  locale: "es" as const,
  timezone: "Europe/Madrid",
  appUrl: "https://dmuster.example",
};

describe("buildCalendarEvent", () => {
  it("builds a timed event with the given start time and duration", () => {
    const event = buildCalendarEvent({ ...BASE_INPUT, startTime: "20:00", durationMinutes: 120 });

    expect(event.start).toEqual({ dateTime: "2026-09-05T20:00:00", timeZone: "Europe/Madrid" });
    expect(event.end).toEqual({ dateTime: "2026-09-05T22:00:00", timeZone: "Europe/Madrid" });
  });

  it("defaults to a 4-hour duration when none is given", () => {
    const event = buildCalendarEvent({ ...BASE_INPUT, startTime: "20:00", durationMinutes: null });

    expect(event.end).toEqual({ dateTime: "2026-09-06T00:00:00", timeZone: "Europe/Madrid" });
  });

  it("rolls the end time over to the next day when duration crosses midnight", () => {
    const event = buildCalendarEvent({ ...BASE_INPUT, startTime: "22:00", durationMinutes: 240 });

    expect(event.end).toEqual({ dateTime: "2026-09-06T02:00:00", timeZone: "Europe/Madrid" });
  });

  it("builds an all-day event ending the day after when there is no start time", () => {
    const event = buildCalendarEvent({ ...BASE_INPUT, startTime: null, durationMinutes: null });

    expect(event.start).toEqual({ date: "2026-09-05" });
    expect(event.end).toEqual({ date: "2026-09-06" }); // Google's all-day end is exclusive
  });

  it("builds the description in the recipient's locale", () => {
    const es = buildCalendarEvent({ ...BASE_INPUT, startTime: null, durationMinutes: null, locale: "es" });
    const en = buildCalendarEvent({ ...BASE_INPUT, startTime: null, durationMinutes: null, locale: "en" });

    expect(es.description).toContain("Ana, David, Paola");
    expect(es.description.toLowerCase()).toContain("juegan");
    expect(en.description.toLowerCase()).toContain("playing");
  });

  it("links to the sessions list when a base URL is configured, and omits the line otherwise", () => {
    const withUrl = buildCalendarEvent({ ...BASE_INPUT, startTime: null, durationMinutes: null });
    const withoutUrl = buildCalendarEvent({
      ...BASE_INPUT,
      startTime: null,
      durationMinutes: null,
      appUrl: null,
    });

    expect(withUrl.description).toContain("https://dmuster.example/sessions");
    expect(withoutUrl.description).not.toContain("https://");
  });

  it("carries the session id in extendedProperties.private for orphan tracing", () => {
    const event = buildCalendarEvent({ ...BASE_INPUT, startTime: null, durationMinutes: null });

    expect(event.extendedProperties.private.dmusterSessionId).toBe("session-1");
  });

  it("never includes an attendees field", () => {
    const event = buildCalendarEvent({ ...BASE_INPUT, startTime: "20:00", durationMinutes: 120 });

    expect(event).not.toHaveProperty("attendees");
  });
});
