import {
  DEFAULT_REQUIREMENTS_WINDOW,
  findAnchorSession,
  isOptionalOn,
  requirementsApplyOn,
  resolveRequirementsWindow,
} from "@/lib/campaignRequirements";

const TZ = "Europe/Madrid";

/** A confirmed-session fixture: its day and when it was confirmed. */
function session(date: string, createdAt: string) {
  return { date, createdAt: new Date(createdAt) };
}

describe("findAnchorSession", () => {
  const setAt = new Date("2026-10-25T10:00:00Z"); // 11:00 in Madrid

  it("picks the earliest session dated after the save", () => {
    const anchor = findAnchorSession(
      setAt,
      [
        session("2026-11-14", "2026-10-20T10:00:00Z"),
        session("2026-11-07", "2026-10-26T10:00:00Z"),
      ],
      TZ,
    );

    expect(anchor?.date).toBe("2026-11-07");
  });

  it("anchors on a session confirmed before the save but dated after it", () => {
    const anchor = findAnchorSession(
      setAt,
      [session("2026-11-07", "2026-10-01T10:00:00Z")],
      TZ,
    );

    expect(anchor?.date).toBe("2026-11-07");
  });

  it("ignores sessions dated before the save", () => {
    expect(
      findAnchorSession(setAt, [session("2026-10-24", "2026-10-01T10:00:00Z")], TZ),
    ).toBeNull();
  });

  it("ignores a same-day session confirmed before the save (the one just played)", () => {
    expect(
      findAnchorSession(setAt, [session("2026-10-25", "2026-10-20T10:00:00Z")], TZ),
    ).toBeNull();
  });

  it("anchors on a same-day session confirmed after the save", () => {
    const anchor = findAnchorSession(
      setAt,
      [session("2026-10-25", "2026-10-25T11:00:00Z")],
      TZ,
    );

    expect(anchor?.date).toBe("2026-10-25");
  });

  it("takes the day of the save in the app's timezone, not UTC", () => {
    // 23:30 UTC on the 24th is already 01:30 on the 25th in Madrid, so a
    // session on the 25th confirmed earlier is the one being played that day.
    const lateSave = new Date("2026-10-24T23:30:00Z");

    expect(
      findAnchorSession(lateSave, [session("2026-10-25", "2026-10-20T10:00:00Z")], TZ),
    ).toBeNull();
  });
});

describe("resolveRequirementsWindow", () => {
  const setAt = new Date("2026-10-25T10:00:00Z");

  it("is inactive when the campaign uses the default rule", () => {
    expect(
      resolveRequirementsWindow({
        setAt: null,
        sessions: [session("2026-11-07", "2026-10-26T10:00:00Z")],
        today: "2026-10-25",
        timeZone: TZ,
      }),
    ).toEqual(DEFAULT_REQUIREMENTS_WINDOW);
  });

  it("is open-ended while no session is confirmed after the save", () => {
    expect(
      resolveRequirementsWindow({ setAt, sessions: [], today: "2026-12-01", timeZone: TZ }),
    ).toEqual({ active: true, untilDate: null });
  });

  it("lasts until the anchor session's date, including its own day", () => {
    const sessions = [session("2026-11-07", "2026-10-26T10:00:00Z")];

    expect(
      resolveRequirementsWindow({ setAt, sessions, today: "2026-11-07", timeZone: TZ }),
    ).toEqual({ active: true, untilDate: "2026-11-07" });
  });

  it("expires on its own once the anchor session has passed", () => {
    const sessions = [session("2026-11-07", "2026-10-26T10:00:00Z")];

    expect(
      resolveRequirementsWindow({ setAt, sessions, today: "2026-11-08", timeZone: TZ }),
    ).toEqual(DEFAULT_REQUIREMENTS_WINDOW);
  });
});

describe("isOptionalOn", () => {
  it("uses the standing setting while no next-session requirements govern the day", () => {
    expect(isOptionalOn({ optional: false, alwaysOptional: true }, false)).toBe(true);
    expect(isOptionalOn({ optional: true, alwaysOptional: false }, false)).toBe(false);
  });

  it("lets the next-session requirements decide while they govern the day", () => {
    // Salgado is always optional, but required for this one session.
    expect(isOptionalOn({ optional: false, alwaysOptional: true }, true)).toBe(false);
    expect(isOptionalOn({ optional: true, alwaysOptional: false }, true)).toBe(true);
  });
});

describe("requirementsApplyOn", () => {
  it("never applies when the window is inactive", () => {
    expect(requirementsApplyOn(DEFAULT_REQUIREMENTS_WINDOW, "2026-11-07")).toBe(false);
  });

  it("applies to every day while open-ended", () => {
    const window = { active: true, untilDate: null } as const;

    expect(requirementsApplyOn(window, "2027-03-01")).toBe(true);
  });

  it("applies up to the anchor date and not after it", () => {
    const window = { active: true, untilDate: "2026-11-07" } as const;

    expect(requirementsApplyOn(window, "2026-11-06")).toBe(true);
    expect(requirementsApplyOn(window, "2026-11-07")).toBe(true);
    expect(requirementsApplyOn(window, "2026-11-08")).toBe(false);
  });
});
