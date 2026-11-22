import {
  buildIcsCalendar,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  type IcsEvent,
} from "@/lib/calendarFeed/ics";

const GENERATED_AT = new Date("2026-11-17T10:00:00.000Z");

const TIMED: IcsEvent = {
  kind: "timed",
  uid: "session-abc@dmuster",
  summary: "Academia",
  description: "Juegan: Ana, Luis",
  url: "https://dmuster.example/sessions",
  start: new Date("2026-11-20T20:00:00.000Z"),
  end: new Date("2026-11-21T00:00:00.000Z"),
  lastModified: new Date("2026-11-16T09:30:00.000Z"),
};

const ALL_DAY: IcsEvent = {
  kind: "allDay",
  uid: "reminder-2026-12-u1@dmuster",
  summary: "REVISAR CALENDARIO ROL",
  description: "Completa tu disponibilidad",
  url: null,
  dateIso: "2026-11-30",
  lastModified: new Date("2026-11-30T00:00:00.000Z"),
};

describe("escapeIcsText", () => {
  it("escapes backslashes, semicolons, commas and line breaks", () => {
    expect(escapeIcsText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });

  it("leaves plain text untouched", () => {
    expect(escapeIcsText("Academia (Online)")).toBe("Academia (Online)");
  });
});

describe("foldIcsLine", () => {
  it("returns short lines unchanged", () => {
    expect(foldIcsLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds long ASCII lines at 75 octets with a leading space on continuations", () => {
    const folded = foldIcsLine(`DESCRIPTION:${"x".repeat(200)}`);
    const physical = folded.split("\r\n");

    expect(physical[0]).toHaveLength(75);
    for (const line of physical.slice(1)) {
      expect(line.startsWith(" ")).toBe(true);
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(physical.map((line, i) => (i === 0 ? line : line.slice(1))).join("")).toBe(
      `DESCRIPTION:${"x".repeat(200)}`,
    );
  });

  it("never splits a multi-byte character", () => {
    const original = `SUMMARY:${"ñ€😀".repeat(40)}`;
    const physical = foldIcsLine(original).split("\r\n");

    for (const line of physical) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    const rejoined = physical.map((line, i) => (i === 0 ? line : line.slice(1))).join("");
    expect(rejoined).toBe(original);
    expect(rejoined).not.toContain("�");
  });
});

describe("formatIcsUtc", () => {
  it("formats an instant as a compact UTC date-time", () => {
    expect(formatIcsUtc(new Date("2026-03-29T01:05:09.123Z"))).toBe("20260329T010509Z");
  });
});

describe("buildIcsCalendar", () => {
  const ics = buildIcsCalendar({
    name: "DMuster, partidas",
    events: [TIMED, ALL_DAY],
    generatedAt: GENERATED_AT,
  });

  it("uses CRLF line endings and ends with one", () => {
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("writes the calendar header and an escaped name", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:DMuster\\, partidas\r\n");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n");
  });

  it("writes a timed event in UTC", () => {
    expect(ics).toContain("UID:session-abc@dmuster\r\n");
    expect(ics).toContain("DTSTAMP:20261117T100000Z\r\n");
    expect(ics).toContain("DTSTART:20261120T200000Z\r\n");
    expect(ics).toContain("DTEND:20261121T000000Z\r\n");
    expect(ics).toContain("DESCRIPTION:Juegan: Ana\\, Luis\r\n");
    expect(ics).toContain("URL:https://dmuster.example/sessions\r\n");
    expect(ics).toContain("LAST-MODIFIED:20261116T093000Z\r\n");
  });

  it("writes an all-day event with an exclusive end day and no URL line", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20261130\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261201\r\n");
    const reminderBlock = ics.slice(ics.indexOf("UID:reminder-"));
    expect(reminderBlock.split("END:VEVENT")[0]).not.toContain("URL:");
  });

  it("balances every BEGIN with its END", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
  });

  it("produces an empty but valid calendar with no events", () => {
    const empty = buildIcsCalendar({ name: "x", events: [], generatedAt: GENERATED_AT });

    expect(empty).not.toContain("VEVENT");
    expect(empty.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
