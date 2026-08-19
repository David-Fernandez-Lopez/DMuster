// Pure rules for the master-override flow (roadmap #22): whether a member may
// self-join a confirmed session, and whether an attendee may be removed from
// one. Free of Prisma/Next imports so they stay trivially unit-testable (see
// roadmap #17's precedent with viability.ts), same discipline as
// sessionConflict.ts.

import type { PlayerStatusValue } from "@/lib/calendarService";

/**
 * Decides whether a member may self-join a confirmed session right now — the
 * locked #22 rejoin rule: a member who is not already attending, answered
 * `YES` for the day, and the session is still active and not in the past.
 *
 * @param {object} input
 * @param {boolean} input.isMember - Whether the user belongs to the campaign.
 * @param {boolean} input.isAttendee - Whether the user is already an attendee.
 * @param {PlayerStatusValue} input.status - The user's stored response for the day.
 * @param {boolean} input.sessionActive - Whether the session is not cancelled.
 * @param {boolean} input.isPast - Whether the session's date is before today.
 * @returns {boolean} True when the self-join action should be offered.
 */
export function canSelfJoin(input: {
  isMember: boolean;
  isAttendee: boolean;
  status: PlayerStatusValue;
  sessionActive: boolean;
  isPast: boolean;
}): boolean {
  return (
    input.isMember &&
    !input.isAttendee &&
    input.status === "YES" &&
    input.sessionActive &&
    !input.isPast
  );
}

/** Why an attendee removal was refused. Maps 1:1 to `sessions.errors.*` keys. */
export type RemoveAttendeeRefusal = "forbidden" | "lastAttendee" | "dmMustAttend";

/**
 * Decides whether removing one attendee from a session is allowed — only a DM
 * may remove (even themselves, the locked #22 decision that a player can
 * never remove themselves), and the session must be left with at least one
 * attendee and at least one DM among them.
 *
 * @param {object} input
 * @param {boolean} input.actorIsDm - Whether the acting user is a DM of the session's campaign.
 * @param {number} input.remainingAttendees - Attendee count AFTER the removal.
 * @param {number} input.remainingDms - DM-attendee count AFTER the removal.
 * @returns {{ allowed: boolean; reason?: RemoveAttendeeRefusal }} The verdict.
 */
export function canRemoveAttendee(input: {
  actorIsDm: boolean;
  remainingAttendees: number;
  remainingDms: number;
}): { allowed: boolean; reason?: RemoveAttendeeRefusal } {
  if (!input.actorIsDm) {
    return { allowed: false, reason: "forbidden" };
  }
  if (input.remainingAttendees < 1) {
    return { allowed: false, reason: "lastAttendee" };
  }
  if (input.remainingDms < 1) {
    return { allowed: false, reason: "dmMustAttend" };
  }
  return { allowed: true };
}
