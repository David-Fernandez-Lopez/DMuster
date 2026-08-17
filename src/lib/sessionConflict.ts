// Pure conflict logic for confirmed sessions: given the attendees of every
// other active session on a date, decide which ones share a person with a
// candidate attendee set. Free of Prisma/Next imports so it stays trivially
// unit-testable (see roadmap #17's precedent with viability.ts) and reusable
// from the service layer in #21/#22.

/** One other active session on the same date, with its attendees. */
export type SessionAttendance = {
  sessionId: string;
  campaignId: string;
  campaignName: string;
  /** Cancelled sessions free their attendees again — callers should filter
   * these out upstream, but the check is repeated here as defence in depth. */
  cancelled: boolean;
  attendeeIds: string[];
  /** Display name per attendee id, for building an actionable error message. */
  attendeeNames: Record<string, string>;
};

/** A blocking conflict: another session that shares at least one attendee. */
export type SessionConflict = {
  sessionId: string;
  campaignId: string;
  campaignName: string;
  /** Names of the people who would be double-booked, alphabetically ordered. */
  sharedNames: string[];
};

/**
 * Finds every other active session on the same date that shares at least one
 * attendee with the candidate set — the locked conflict rule: two sessions
 * conflict when they share any attendee, DMs included, since a master cannot
 * run two confirmed sessions the same day. Sessions with fully disjoint
 * attendee sets may both be confirmed.
 *
 * @param {readonly string[]} attendeeIds - The candidate session's attendee ids.
 * @param {readonly SessionAttendance[]} otherSessions - Every other active
 *   session on the same date, with their own attendees.
 * @param {string} [excludeSessionId] - A session id to skip (the one being
 *   edited), so re-confirming/updating a session never conflicts with itself.
 * @returns {SessionConflict[]} The blocking sessions, each naming the shared
 *   people. Empty when the candidate set is free to be confirmed.
 */
export function findConflictingSessions(
  attendeeIds: readonly string[],
  otherSessions: readonly SessionAttendance[],
  excludeSessionId?: string,
): SessionConflict[] {
  const candidateIds = new Set(attendeeIds);

  const conflicts: SessionConflict[] = [];
  for (const session of otherSessions) {
    if (session.cancelled || session.sessionId === excludeSessionId) {
      continue;
    }

    const sharedNames = session.attendeeIds
      .filter((id) => candidateIds.has(id))
      .map((id) => session.attendeeNames[id])
      .sort((a, b) => a.localeCompare(b));

    if (sharedNames.length > 0) {
      conflicts.push({
        sessionId: session.sessionId,
        campaignId: session.campaignId,
        campaignName: session.campaignName,
        sharedNames,
      });
    }
  }

  return conflicts;
}
