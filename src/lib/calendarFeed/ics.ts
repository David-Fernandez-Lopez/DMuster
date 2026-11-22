// Pure iCalendar (RFC 5545) serializer for the per-user subscription feed. No
// Prisma, no network and no clock: callers pass already-resolved events, so the
// output is deterministic and trivially unit-testable.
//
// Timed events are written in UTC (`...Z`), so the feed needs no VTIMEZONE
// block and every client resolves DST on its own. All-day events use
// `VALUE=DATE` with an exclusive end day, as the RFC requires.

import { addDays } from "@/lib/date";

/** Line terminator mandated by RFC 5545. */
const CRLF = "\r\n";

/** Maximum content line length in octets, excluding the CRLF (RFC 5545 §3.1). */
const MAX_LINE_OCTETS = 75;

/** Fields shared by every event. */
type IcsEventBase = {
  /** Globally unique and stable across feed refreshes, so clients update in place. */
  uid: string;
  summary: string;
  description: string;
  /** Absolute link shown by clients, or null to omit the `URL` property. */
  url: string | null;
  /** When the event content last changed; drives clients' update detection. */
  lastModified: Date;
};

/** An event at a specific instant. */
export type IcsTimedEvent = IcsEventBase & {
  kind: "timed";
  start: Date;
  end: Date;
};

/** An event covering whole calendar days. */
export type IcsAllDayEvent = IcsEventBase & {
  kind: "allDay";
  /** First day, "YYYY-MM-DD". */
  dateIso: string;
};

export type IcsEvent = IcsTimedEvent | IcsAllDayEvent;

/** Input to `buildIcsCalendar`. */
export type IcsCalendarInput = {
  /** Calendar display name (`X-WR-CALNAME`). */
  name: string;
  events: IcsEvent[];
  /** Serialization instant, written as every event's `DTSTAMP`. */
  generatedAt: Date;
};

/**
 * Escapes a TEXT value (RFC 5545 §3.3.11): backslash, semicolon and comma get a
 * backslash, and line breaks become a literal `\n`.
 *
 * @param {string} value - Raw text.
 * @returns {string} The text safe to place after a property name.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a content line so no physical line exceeds 75 octets: each continuation
 * starts with a single space, which counts towards its own 75. Splitting happens
 * on code point boundaries, so a multi-byte UTF-8 character is never cut in half.
 *
 * @param {string} line - One unfolded content line, without its CRLF.
 * @returns {string} The folded line, with CRLF between its physical lines.
 */
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= MAX_LINE_OCTETS) {
    return line;
  }

  const physicalLines: string[] = [];
  let current = "";
  let currentOctets = 0;

  for (const character of line) {
    const octets = Buffer.byteLength(character, "utf8");
    // A continuation line spends one octet on its leading space.
    const limit = physicalLines.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (currentOctets + octets > limit) {
      physicalLines.push(current);
      current = "";
      currentOctets = 0;
    }
    current += character;
    currentOctets += octets;
  }
  physicalLines.push(current);

  return physicalLines.join(`${CRLF} `);
}

/**
 * Formats an instant as an iCalendar UTC date-time, "YYYYMMDDTHHMMSSZ".
 *
 * @param {Date} instant - The instant to format.
 * @returns {string} The UTC date-time value.
 */
export function formatIcsUtc(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Formats a "YYYY-MM-DD" day as an iCalendar DATE value, "YYYYMMDD".
 *
 * @param {string} dateIso - The day, "YYYY-MM-DD".
 * @returns {string} The DATE value.
 */
function formatIcsDate(dateIso: string): string {
  return dateIso.replace(/-/g, "");
}

/**
 * Serializes one event into its unfolded content lines.
 *
 * @param {IcsEvent} event - The event to serialize.
 * @param {string} dtstamp - The already formatted `DTSTAMP` value.
 * @returns {string[]} The `BEGIN:VEVENT` … `END:VEVENT` lines.
 */
function eventLines(event: IcsEvent, dtstamp: string): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${dtstamp}`];

  if (event.kind === "timed") {
    lines.push(`DTSTART:${formatIcsUtc(event.start)}`, `DTEND:${formatIcsUtc(event.end)}`);
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${formatIcsDate(event.dateIso)}`,
      `DTEND;VALUE=DATE:${formatIcsDate(addDays(event.dateIso, 1))}`,
    );
  }

  lines.push(
    `SUMMARY:${escapeIcsText(event.summary)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
  );
  if (event.url) {
    lines.push(`URL:${event.url}`);
  }
  lines.push(
    `LAST-MODIFIED:${formatIcsUtc(event.lastModified)}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
  );

  return lines;
}

/**
 * Serializes a whole calendar: header, suggested refresh interval, then every
 * event. Lines are folded and CRLF-terminated, as RFC 5545 requires.
 *
 * @param {IcsCalendarInput} input - Calendar name, events and serialization instant.
 * @returns {string} The `.ics` document.
 */
export function buildIcsCalendar(input: IcsCalendarInput): string {
  const dtstamp = formatIcsUtc(input.generatedAt);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DMuster//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...input.events.flatMap((event) => eventLines(event, dtstamp)),
    "END:VCALENDAR",
  ];

  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
