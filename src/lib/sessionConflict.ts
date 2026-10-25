// Pure conflict logic for confirmed sessions: given the attendees of every
// other active session on a date, decide which ones share a person with a
// candidate attendee set, and which members are already busy elsewhere that
// day (the same rule applied to one person, feeding the "B" viability tier).
// Free of Prisma/Next imports so it stays trivially unit-testable (see roadmap
// #17's precedent with viability.ts) and reusable from the service layer in
// #21/#22.

/** One other active session on the same date, with its attendees. */
export type SessionAttendance = {
  sessionId: string;
  campaignId: string;
  campaignName: string;
  /** The campaign's 2-letter chip label, for the "Juega en AC" busy pill. */
  campaignTag: string;
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

/** The campaign whose active session a member already attends on a day. */
export type BusySession = {
  campaignId: string;
  campaignName: string;
  campaignTag: string;
};

/**
 * Indexes one day's active sessions by attendee: for every person, the
 * campaigns whose session they attend. Cancelled sessions are skipped (their
 * attendees are free again). Each entry is a list rather than a single
 * session because a race between two confirmations could double-book someone,
 * and the index must not hide that.
 *
 * @param {readonly SessionAttendance[]} sessions - Every active session on a
 *   single day.
 * @returns {Map<string, BusySession[]>} userId → the sessions they attend.
 */
export function buildBusyIndex(
  sessions: readonly SessionAttendance[],
): Map<string, BusySession[]> {
  const index = new Map<string, BusySession[]>();
  for (const session of sessions) {
    if (session.cancelled) {
      continue;
    }
    const busy: BusySession = {
      campaignId: session.campaignId,
      campaignName: session.campaignName,
      campaignTag: session.campaignTag,
    };
    for (const attendeeId of session.attendeeIds) {
      const entries = index.get(attendeeId);
      if (entries) {
        entries.push(busy);
      } else {
        index.set(attendeeId, [busy]);
      }
    }
  }
  return index;
}

/**
 * Whether a member is busy for a campaign on the indexed day: they attend an
 * active session of a **different** campaign. This is the shared-attendee
 * conflict rule (`findConflictingSessions`) applied to a single person, so a
 * busy member is exactly one whose inclusion would make the campaign's session
 * conflict. Attending the campaign's own session does not make them busy for it.
 *
 * @param {ReadonlyMap<string, readonly BusySession[]>} index - The day's
 *   index from `buildBusyIndex`.
 * @param {string} userId - The member to check.
 * @param {string} campaignId - The campaign the member is being considered for.
 * @returns {BusySession | null} The other campaign's session they attend, or
 *   `null` when they are free for this campaign.
 */
export function findBusySession(
  index: ReadonlyMap<string, readonly BusySession[]>,
  userId: string,
  campaignId: string,
): BusySession | null {
  const entries = index.get(userId);
  if (!entries) {
    return null;
  }
  return entries.find((entry) => entry.campaignId !== campaignId) ?? null;
}
