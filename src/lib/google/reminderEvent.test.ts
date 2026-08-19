import { buildReminderEvent } from "@/lib/google/reminderEvent";

const BASE_INPUT = {
  month: "2026-09",
  dateIso: "2026-08-31",
  locale: "es" as const,
  appUrl: "https://dmuster.example",
};

describe("buildReminderEvent", () => {
  it("builds an all-day event ending the day after (Google's all-day end is exclusive)", () => {
    const event = buildReminderEvent(BASE_INPUT);

    expect(event.start).toEqual({ date: "2026-08-31" });
    expect(event.end).toEqual({ date: "2026-09-01" });
  });

  it("titles the event in the recipient's locale", () => {
    const es = buildReminderEvent({ ...BASE_INPUT, locale: "es" });
    const en = buildReminderEvent({ ...BASE_INPUT, locale: "en" });

    expect(es.summary).toBe("REVISAR CALENDARIO ROL");
    expect(en.summary).toBe("REVIEW RPG CALENDAR");
  });

  it("includes the localized month name in the description", () => {
    const es = buildReminderEvent({ ...BASE_INPUT, locale: "es" });
    const en = buildReminderEvent({ ...BASE_INPUT, locale: "en" });

    expect(es.description).toContain("septiembre de 2026");
    expect(en.description).toContain("September 2026");
  });

  it("links to the availability screen when a base URL is configured, and omits the line otherwise", () => {
    const withUrl = buildReminderEvent(BASE_INPUT);
    const withoutUrl = buildReminderEvent({ ...BASE_INPUT, appUrl: null });

    expect(withUrl.description).toContain("https://dmuster.example/availability");
    expect(withoutUrl.description).not.toContain("https://");
  });

  it("carries the reviewed month in extendedProperties.private for orphan tracing", () => {
    const event = buildReminderEvent(BASE_INPUT);

    expect(event.extendedProperties.private.dmusterReminderMonth).toBe("2026-09");
  });

  it("never includes an attendees field", () => {
    const event = buildReminderEvent(BASE_INPUT);

    expect(event).not.toHaveProperty("attendees");
  });
});
