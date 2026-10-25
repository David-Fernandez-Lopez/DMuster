// Pure rules for a campaign's next-session requirements (roadmap #25): whether
// a DM's custom requirements (required players, minimum players) are in force,
// and which calendar days they apply to. They last until the campaign's next
// confirmed session has passed — then the default "everyone is required" rule
// comes back on its own, so a forgotten setting never keeps painting days
// green. Free of Prisma/Next imports so they stay trivially unit-testable,
// same discipline as viability.ts and sessionRules.ts.

import { toIsoDateIn } from "@/lib/date";

/**
 * Whether a campaign's custom requirements are in force. When active, they
 * apply up to and including `untilDate` — the date of the session they were
 * set for — or to every day while no such session is confirmed (`null`).
 */
export type RequirementsWindow =
  | { active: false }
  | { active: true; untilDate: string | null };

/** The default rule: no custom requirements, everyone is required. */
export const DEFAULT_REQUIREMENTS_WINDOW: RequirementsWindow = { active: false };

/** The fields of an active confirmed session that decide whether it is the anchor. */
export type AnchorCandidate = {
  /** The session's calendar day, "YYYY-MM-DD". */
  date: string;
  /** When the session was confirmed. */
  createdAt: Date;
};

/**
 * Picks the session a campaign's custom requirements were set for — the
 * "anchor" whose passing ends them: the earliest active session dated after
 * the day the requirements were saved, or on that same day but confirmed after
 * they were saved. A session already confirmed for that day before the save is
 * the one the DM just finished planning, not the next one, so it never
 * anchors.
 *
 * The day of the save is taken in the app's timezone, since that is the
 * calendar the session dates live in.
 *
 * @param {Date} setAt - When the requirements were saved.
 * @param {readonly T[]} sessions - The campaign's **active** (not cancelled)
 *   confirmed sessions; any order.
 * @param {string} timeZone - IANA timezone of the app's calendar.
 * @returns {T | null} The anchor session, or `null` when none qualifies.
 */
export function findAnchorSession<T extends AnchorCandidate>(
  setAt: Date,
  sessions: readonly T[],
  timeZone: string,
): T | null {
  const setDate = toIsoDateIn(setAt, timeZone);
  let anchor: T | null = null;
  for (const session of sessions) {
    const isAfterSave =
      session.date > setDate ||
      (session.date === setDate && session.createdAt.getTime() > setAt.getTime());
    if (isAfterSave && (anchor === null || session.date < anchor.date)) {
      anchor = session;
    }
  }
  return anchor;
}

/**
 * Resolves whether a campaign's custom requirements are in force today and up
 * to which day they apply:
 *
 * - never saved (`setAt` is `null`) ⇒ inactive (the default rule)
 * - the anchor session is already past ⇒ inactive (they expired on their own)
 * - otherwise ⇒ active until the anchor's date, or open-ended without one
 *
 * @param {object} input
 * @param {Date | null} input.setAt - When the requirements were saved, or
 *   `null` when the campaign uses the default rule.
 * @param {readonly AnchorCandidate[]} input.sessions - The campaign's active
 *   confirmed sessions (only those dated on or after the save matter).
 * @param {string} input.today - Today's date in the app's timezone, "YYYY-MM-DD".
 * @param {string} input.timeZone - IANA timezone of the app's calendar.
 * @returns {RequirementsWindow} The requirements' window.
 */
export function resolveRequirementsWindow(input: {
  setAt: Date | null;
  sessions: readonly AnchorCandidate[];
  today: string;
  timeZone: string;
}): RequirementsWindow {
  if (input.setAt === null) {
    return DEFAULT_REQUIREMENTS_WINDOW;
  }
  const anchor = findAnchorSession(input.setAt, input.sessions, input.timeZone);
  if (anchor !== null && anchor.date < input.today) {
    return DEFAULT_REQUIREMENTS_WINDOW;
  }
  return { active: true, untilDate: anchor?.date ?? null };
}

/**
 * Whether a campaign's custom requirements apply to a given calendar day: the
 * window is active and the day is not after the session they were set for.
 * Days after it are planned with the default rule, so they do not show up
 * viable today only to turn red once that session has passed.
 *
 * @param {RequirementsWindow} window - The campaign's requirements window.
 * @param {string} dateIso - The calendar day, "YYYY-MM-DD".
 * @returns {boolean} True when the custom requirements govern that day.
 */
export function requirementsApplyOn(
  window: RequirementsWindow,
  dateIso: string,
): boolean {
  return window.active && (window.untilDate === null || dateIso <= window.untilDate);
}
