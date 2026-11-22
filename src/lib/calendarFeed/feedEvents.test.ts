import {
  addWallClockMinutes,
  buildReminderEvent,
  buildSessionEvent,
  needsAvailabilityReminder,
  type SessionEventInput,
} from "@/lib/calendarFeed/feedEvents";

const BASE: SessionEventInput = {
  sessionId: "s1",
  campaignName: "Academia",
  dateIso: "2026-11-20",
  startTime: "21:00",
  durationMinutes: 180,
  attendeeNames: ["Ana", "Luis"],
  onlineAttendeeNames: [],
  updatedAt: new Date("2026-11-16T09:00:00.000Z"),
  locale: "es",
  timezone: "Europe/Madrid",
  appUrl: "https://dmuster.example",
};

describe("addWallClockMinutes", () => {
  it("stays on the same day when the sum does not pass midnight", () => {
    expect(addWallClockMinutes("2026-11-20", "18:30", 120)).toEqual({
      dateIso: "2026-11-20",
      time: "20:30",
    });
  });

  it("carries into the next day past midnight", () => {
    expect(addWallClockMinutes("2026-11-20", "22:00", 240)).toEqual({
      dateIso: "2026-11-21",
      time: "02:00",
    });
  });

  it("carries across a month boundary", () => {
    expect(addWallClockMinutes("2026-11-30", "23:00", 120)).toEqual({
      dateIso: "2026-12-01",
      time: "01:00",
    });
  });
});

describe("buildSessionEvent", () => {
  it("builds a timed event in UTC from the local wall time", () => {
    const event = buildSessionEvent(BASE);

    expect(event).toMatchObject({
      kind: "timed",
      uid: "session-s1@dmuster",
      summary: "Academia",
      url: "https://dmuster.example/sessions",
    });
    if (event.kind !== "timed") throw new Error("expected a timed event");
    expect(event.start.toISOString()).toBe("2026-11-20T20:00:00.000Z");
    expect(event.end.toISOString()).toBe("2026-11-20T23:00:00.000Z");
    expect(event.lastModified).toEqual(BASE.updatedAt);
  });

  it("defaults the duration to four hours when none is set", () => {
    const event = buildSessionEvent({ ...BASE, durationMinutes: null });

    if (event.kind !== "timed") throw new Error("expected a timed event");
    expect(event.end.getTime() - event.start.getTime()).toBe(4 * 60 * 60 * 1000);
  });

  it("ends the next day when the session runs past midnight", () => {
    const event = buildSessionEvent({ ...BASE, startTime: "22:00", durationMinutes: 240 });

    if (event.kind !== "timed") throw new Error("expected a timed event");
    expect(event.end.toISOString()).toBe("2026-11-21T01:00:00.000Z");
  });

  it("becomes an all-day event without a start time", () => {
    const event = buildSessionEvent({ ...BASE, startTime: null, durationMinutes: null });

    expect(event).toMatchObject({ kind: "allDay", dateIso: "2026-11-20" });
  });

  it("lists the players in the description", () => {
    expect(buildSessionEvent(BASE).description).toBe("Juegan: Ana, Luis");
  });

  it("marks the event online and names who plays remotely", () => {
    const event = buildSessionEvent({ ...BASE, onlineAttendeeNames: ["Luis"] });

    expect(event.summary).toBe("Academia (Online)");
    expect(event.description).toBe("Juegan: Ana, Luis\nOnline: Luis");
  });

  it("does not HTML-escape names", () => {
    const event = buildSessionEvent({ ...BASE, attendeeNames: ["Tom & Jerry"] });

    expect(event.description).toBe("Juegan: Tom & Jerry");
  });

  it("omits the link without an app URL", () => {
    expect(buildSessionEvent({ ...BASE, appUrl: null }).url).toBeNull();
  });

  it("translates to the owner's locale", () => {
    const event = buildSessionEvent({ ...BASE, locale: "en", onlineAttendeeNames: ["Luis"] });

    expect(event.description).toBe("Playing: Ana, Luis\nOnline: Luis");
  });
});

describe("needsAvailabilityReminder", () => {
  const days = ["2026-12-04", "2026-12-05", "2026-12-06"];

  it("is false when every eligible day is answered", () => {
    expect(needsAvailabilityReminder(days, new Set(days))).toBe(false);
  });

  it("is true when any eligible day is unanswered", () => {
    expect(needsAvailabilityReminder(days, new Set(["2026-12-04", "2026-12-06"]))).toBe(true);
  });

  it("is false for a month with no eligible days", () => {
    expect(needsAvailabilityReminder([], new Set())).toBe(false);
  });
});

describe("buildReminderEvent", () => {
  const input = {
    month: "2026-12",
    dateIso: "2026-11-30",
    userId: "u1",
    locale: "es" as const,
    appUrl: "https://dmuster.example",
    now: new Date("2026-11-17T10:00:00.000Z"),
  };

  it("builds an all-day event with a stable UID on the given day", () => {
    expect(buildReminderEvent(input)).toMatchObject({
      kind: "allDay",
      uid: "reminder-2026-12-u1@dmuster",
      summary: "REVISAR CALENDARIO ROL",
      dateIso: "2026-11-30",
    });
  });

  it("names the month in the owner's language and links to the availability page", () => {
    const event = buildReminderEvent(input);

    expect(event.description).toContain("diciembre de 2026");
    expect(event.description).toContain("https://dmuster.example/availability");
  });

  it("uses English copy for English users", () => {
    const event = buildReminderEvent({ ...input, locale: "en" });

    expect(event.summary).toBe("REVIEW RPG CALENDAR");
    expect(event.description).toContain("December 2026");
  });

  it("omits the link without an app URL", () => {
    const event = buildReminderEvent({ ...input, appUrl: null });

    expect(event.url).toBeNull();
    expect(event.description).not.toContain("http");
  });
});
