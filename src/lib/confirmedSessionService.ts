import { Prisma } from "@/generated/prisma/client";
import { CampaignRole } from "@/generated/prisma/enums";
import { getCampaignRole } from "@/lib/authz";
import type { PlayerStatusValue } from "@/lib/calendarService";
import { isEligible, toIsoDate, toUtcDate, todayIso } from "@/lib/date";
import { listHolidays } from "@/lib/holidayService";
import { prisma } from "@/lib/prisma";
import {
  findConflictingSessions,
  type SessionAttendance,
  type SessionConflict,
} from "@/lib/sessionConflict";
import { canRemoveAttendee, canSelfJoin } from "@/lib/sessionRules";
import { computeViability, type Viability } from "@/lib/viability";

/** Prisma error code raised on a unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

/**
 * Where-clause fragment selecting only active (non-cancelled) sessions.
 * Spread into every read below so no query can forget to hide cancelled rows
 * — they exist only for history (Phase 2 statistics, #23's event cleanup) and
 * must never leak into the calendar, the upcoming list or the conflict check.
 */
export const ACTIVE_SESSION = { cancelledAt: null } as const;

/** A confirmed session as consumed by the calendar and the day modal. */
export type ConfirmedSessionDto = {
  id: string;
  campaignId: string;
  campaignName: string;
  campaignTag: string;
  /** The session's calendar day, "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" local wall time, or `null` for an all-day session. */
  startTime: string | null;
  /** Only meaningful together with `startTime`. */
  durationMinutes: number | null;
};

/** One member of a campaign, as shown in a session's attendee list. */
export type SessionMemberDto = {
  userId: string;
  name: string;
  /** Whether this member is a DM of the session's campaign. */
  isDm: boolean;
  /** The member's stored response for the session's day, or `null` if unanswered. */
  status: PlayerStatusValue;
};

/**
 * A confirmed session enriched with its attendee roster and the viewer's
 * self-join affordance (roadmap #22) — consumed by the day modal and
 * "Próximas partidas".
 */
export type ConfirmedSessionDetailDto = ConfirmedSessionDto & {
  attendees: SessionMemberDto[];
  /** True when the viewer qualifies to self-join this session right now. */
  viewerCanSelfJoin: boolean;
  /**
   * Set only when the viewer would otherwise qualify to self-join but is
   * already an attendee of a different active session the same day — names
   * that campaign so the UI can explain the block inline instead of a
   * disabled button. `null` in every other case (including "hidden").
   */
  viewerSelfJoinBlockedBy: string | null;
};

/** A session on the "Próximas partidas" page: the detail DTO plus the full campaign roster. */
export type UpcomingSessionDto = ConfirmedSessionDetailDto & {
  /** Whether the requesting user is a DM of this session's campaign. */
  viewerIsDm: boolean;
  /**
   * Every member of the campaign, not just attendees — lets the page render
   * the greyed-out "not attending" section without a second fetch.
   */
  campaignMembers: SessionMemberDto[];
};

/** Result of a session mutation that returns the affected session. */
export type ConfirmedSessionMutationResult =
  | { ok: true; session: ConfirmedSessionDto }
  | { ok: false; error: string; params?: Record<string, string> };

/** Result of cancelling a session (soft delete — no session body to return). */
export type CancelSessionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Result of an attendee add/remove mutation. */
export type AttendeeMutationResult =
  | { ok: true; sessionId: string; userId: string }
  | { ok: false; error: string; params?: Record<string, string> };

/**
 * Fetches every active session's attendees on a calendar day, as the shape
 * `findConflictingSessions` (src/lib/sessionConflict.ts) expects. One batched
 * query; already filtered to active sessions, so `cancelled` is always `false`.
 *
 * @param {string} dateIso - The calendar day to check, "YYYY-MM-DD".
 * @returns {Promise<SessionAttendance[]>} Every active session's attendees on that day.
 */
async function loadActiveAttendanceForDate(
  dateIso: string,
): Promise<SessionAttendance[]> {
  const sessions = await prisma.confirmedSession.findMany({
    where: { date: toUtcDate(dateIso), ...ACTIVE_SESSION },
    select: {
      id: true,
      campaignId: true,
      campaign: { select: { name: true } },
      attendees: { select: { userId: true, user: { select: { name: true } } } },
    },
  });

  return sessions.map((session) => ({
    sessionId: session.id,
    campaignId: session.campaignId,
    campaignName: session.campaign.name,
    cancelled: false,
    attendeeIds: session.attendees.map((attendee) => attendee.userId),
    attendeeNames: Object.fromEntries(
      session.attendees.map((attendee) => [attendee.userId, attendee.user.name]),
    ),
  }));
}

/**
 * Reports which other active sessions on a day would be double-booked by a
 * candidate attendee set — the shared-attendee conflict rule (CLAUDE.md /
 * roadmap #21): two sessions conflict when they share any attendee, DMs
 * included. Pure intersection logic lives in `sessionConflict.ts`; this only
 * loads the data.
 *
 * @param {string} dateIso - The calendar day to check, "YYYY-MM-DD".
 * @param {string[]} attendeeIds - The candidate session's attendee ids.
 * @param {string} [excludeSessionId] - A session id to skip (the one being edited).
 * @returns {Promise<SessionConflict[]>} The blocking sessions, empty when free.
 */
export async function findConflicts(
  dateIso: string,
  attendeeIds: string[],
  excludeSessionId?: string,
): Promise<SessionConflict[]> {
  const attendance = await loadActiveAttendanceForDate(dateIso);
  return findConflictingSessions(attendeeIds, attendance, excludeSessionId);
}

/**
 * Recomputes a campaign's viability for one day server-side, never trusting a
 * client-claimed value. Reuses `computeViability` (src/lib/viability.ts) —
 * same rule as the calendar (`getCalendarViability`).
 *
 * @param {string[]} memberIds - Every member's user id.
 * @param {string} dateIso - The calendar day to check, "YYYY-MM-DD".
 * @returns {Promise<Viability>} `S`, `N` or `T`.
 */
async function computeCampaignViabilityOnDate(
  memberIds: string[],
  dateIso: string,
): Promise<Viability> {
  if (memberIds.length === 0) {
    return "S";
  }

  const rows = await prisma.availability.findMany({
    where: { userId: { in: memberIds }, date: toUtcDate(dateIso) },
    select: { userId: true, status: true },
  });

  const statusByUser = new Map(rows.map((row) => [row.userId, row.status]));
  return computeViability(memberIds.map((id) => statusByUser.get(id)));
}

/**
 * A confirmed session with its attendee ids only (no names/statuses) —
 * an internal shape between `listConfirmedSessionsForCampaigns` and
 * `getCalendarViability`, which already has every member's name/status in
 * memory and does the full `ConfirmedSessionDetailDto` enrichment itself.
 */
export type ConfirmedSessionWithAttendeeIds = ConfirmedSessionDto & {
  attendeeIds: string[];
};

/**
 * Lists every active confirmed session for a set of campaigns within an
 * inclusive date range, keyed by `"campaignId|YYYY-MM-DD"` for O(1) lookup
 * while the calendar builds its per-day, per-campaign viability map. One
 * batched query — no N+1 per day or per campaign. Includes attendee ids
 * (roadmap #22) so the calendar can render the attendee list and self-join
 * affordance without a second query.
 *
 * @param {string[]} campaignIds - Campaigns to fetch sessions for.
 * @param {string} startIso - Range start, "YYYY-MM-DD" (inclusive).
 * @param {string} endIso - Range end, "YYYY-MM-DD" (inclusive).
 * @returns {Promise<Map<string, ConfirmedSessionWithAttendeeIds>>} Sessions keyed by campaign + day.
 */
export async function listConfirmedSessionsForCampaigns(
  campaignIds: string[],
  startIso: string,
  endIso: string,
): Promise<Map<string, ConfirmedSessionWithAttendeeIds>> {
  const byCampaignAndDate = new Map<string, ConfirmedSessionWithAttendeeIds>();
  if (campaignIds.length === 0) {
    return byCampaignAndDate;
  }

  const sessions = await prisma.confirmedSession.findMany({
    where: {
      campaignId: { in: campaignIds },
      date: { gte: toUtcDate(startIso), lte: toUtcDate(endIso) },
      ...ACTIVE_SESSION,
    },
    select: {
      id: true,
      campaignId: true,
      date: true,
      startTime: true,
      durationMinutes: true,
      campaign: { select: { name: true, tag: true } },
      attendees: { select: { userId: true } },
    },
  });

  for (const session of sessions) {
    const dateIso = toIsoDate(session.date);
    byCampaignAndDate.set(`${session.campaignId}|${dateIso}`, {
      id: session.id,
      campaignId: session.campaignId,
      campaignName: session.campaign.name,
      campaignTag: session.campaign.tag,
      date: dateIso,
      startTime: session.startTime,
      durationMinutes: session.durationMinutes,
      attendeeIds: session.attendees.map((attendee) => attendee.userId),
    });
  }

  return byCampaignAndDate;
}

/**
 * Lists the user's upcoming active confirmed sessions (today or later) across
 * their own campaigns, ordered by date then start time (MySQL sorts `NULL`
 * first in `ASC`, so all-day sessions lead their day) — feeds "Próximas
 * partidas". Includes each session's attendee list (with each attendee's
 * current answer), the full campaign roster (for the greyed-out "not
 * attending" section), whether the requesting user is a DM of that campaign,
 * and the self-join affordance (roadmap #22) — one extra batched availability
 * query beyond #21, still no per-session query.
 *
 * @param {string} userId - The requesting user.
 * @returns {Promise<UpcomingSessionDto[]>} Future active sessions, soonest first.
 */
export async function listUpcomingSessions(
  userId: string,
): Promise<UpcomingSessionDto[]> {
  const sessions = await prisma.confirmedSession.findMany({
    where: {
      ...ACTIVE_SESSION,
      date: { gte: toUtcDate(todayIso()) },
      campaign: { players: { some: { userId } } },
    },
    select: {
      id: true,
      campaignId: true,
      date: true,
      startTime: true,
      durationMinutes: true,
      campaign: {
        select: {
          name: true,
          tag: true,
          players: {
            select: { userId: true, role: true, user: { select: { name: true } } },
          },
        },
      },
      attendees: { select: { userId: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  if (sessions.length === 0) {
    return [];
  }

  // Every distinct member across the returned sessions' campaigns, and every
  // distinct date among them — the availability rows needed to know each
  // member's answer for each session's day. One `in` query, not per-session.
  const memberIds = new Set<string>();
  const dateIsos = new Set<string>();
  for (const session of sessions) {
    for (const player of session.campaign.players) {
      memberIds.add(player.userId);
    }
    dateIsos.add(toIsoDate(session.date));
  }

  const availabilityRows = await prisma.availability.findMany({
    where: {
      userId: { in: [...memberIds] },
      date: { in: [...dateIsos].map(toUtcDate) },
    },
    select: { userId: true, date: true, status: true },
  });
  const statusByDateUser = new Map<string, PlayerStatusValue>();
  for (const row of availabilityRows) {
    statusByDateUser.set(`${toIsoDate(row.date)}|${row.userId}`, row.status);
  }

  // For each date, the campaign the viewer already attends, if any — the
  // shared-attendee conflict rule guarantees at most one, so a plain map
  // suffices to block self-join on every OTHER campaign's session that day.
  const viewerAttendsByDate = new Map<string, string>();
  for (const session of sessions) {
    if (session.attendees.some((attendee) => attendee.userId === userId)) {
      viewerAttendsByDate.set(toIsoDate(session.date), session.campaign.name);
    }
  }

  const today = todayIso();

  return sessions.map((session) => {
    const dateIso = toIsoDate(session.date);
    const roleByUser = new Map(
      session.campaign.players.map((player) => [player.userId, player.role]),
    );
    const nameByUser = new Map(
      session.campaign.players.map((player) => [player.userId, player.user.name]),
    );
    const attendeeIdSet = new Set(session.attendees.map((attendee) => attendee.userId));

    const toMember = (memberId: string): SessionMemberDto => ({
      userId: memberId,
      name: nameByUser.get(memberId) ?? "",
      isDm: roleByUser.get(memberId) === CampaignRole.DM,
      status: statusByDateUser.get(`${dateIso}|${memberId}`) ?? null,
    });

    const attendees = [...attendeeIdSet]
      .map(toMember)
      .sort((a, b) => a.name.localeCompare(b.name));
    const campaignMembers = session.campaign.players
      .map((player) => toMember(player.userId))
      .sort((a, b) => a.name.localeCompare(b.name));

    const viewerCanSelfJoinRaw = canSelfJoin({
      isMember: roleByUser.has(userId),
      isAttendee: attendeeIdSet.has(userId),
      status: statusByDateUser.get(`${dateIso}|${userId}`) ?? null,
      sessionActive: true,
      isPast: dateIso < today,
    });
    const blockingCampaign = viewerCanSelfJoinRaw
      ? viewerAttendsByDate.get(dateIso)
      : undefined;

    return {
      id: session.id,
      campaignId: session.campaignId,
      campaignName: session.campaign.name,
      campaignTag: session.campaign.tag,
      date: dateIso,
      startTime: session.startTime,
      durationMinutes: session.durationMinutes,
      attendees,
      campaignMembers,
      viewerIsDm: roleByUser.get(userId) === CampaignRole.DM,
      viewerCanSelfJoin: viewerCanSelfJoinRaw && !blockingCampaign,
      viewerSelfJoinBlockedBy: blockingCampaign ?? null,
    };
  });
}

/**
 * Confirms a campaign as playing on a given day. Guards run in order —
 * campaign exists, the user is a DM of it (both collapse a non-member into
 * "not found", mirroring `api/campaigns/[id]/players/route.ts`'s
 * `authorizeDm`, so a stranger cannot probe campaign existence), the date is
 * eligible, and no other active session that day shares an attendee. Without
 * `attendeeIds`, the campaign's viability must be `S` and the whole
 * membership becomes the attendee set (roadmap #21 — a viable day means
 * everyone plays). With `attendeeIds` (a DM override, roadmap #22), every id
 * must be a campaign member and the confirming DM must be among them; the
 * viability requirement is lifted, and the session is flagged `forced`
 * whenever it wasn't actually `S`. Session + attendee rows are created inside
 * a transaction so one is never created without the other.
 *
 * @param {object} input
 * @param {string} input.campaignId - The campaign being confirmed.
 * @param {string} input.dateIso - The day being confirmed, "YYYY-MM-DD".
 * @param {string | null} input.startTime - Optional "HH:MM" start time.
 * @param {number | null} input.durationMinutes - Optional duration, minutes.
 * @param {string} input.userId - The confirming user (must be a DM of the campaign).
 * @param {string[]} [input.attendeeIds] - Explicit attendee set for a DM
 *   override on a non-viable day; omitted for the #21 frictionless path.
 * @returns {Promise<ConfirmedSessionMutationResult>} The new session, or an
 *   error key (optionally with interpolation `params`).
 */
export async function confirmSession({
  campaignId,
  dateIso,
  startTime,
  durationMinutes,
  userId,
  attendeeIds,
}: {
  campaignId: string;
  dateIso: string;
  startTime: string | null;
  durationMinutes: number | null;
  userId: string;
  attendeeIds?: string[];
}): Promise<ConfirmedSessionMutationResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      name: true,
      tag: true,
      players: { select: { userId: true, role: true } },
    },
  });
  if (!campaign) {
    return { ok: false, error: "sessions.errors.notFound" };
  }

  const viewer = campaign.players.find((player) => player.userId === userId);
  if (!viewer) {
    return { ok: false, error: "sessions.errors.notFound" };
  }
  if (viewer.role !== CampaignRole.DM) {
    return { ok: false, error: "sessions.errors.forbidden" };
  }

  const holidays = new Set((await listHolidays()).map((holiday) => holiday.date));
  if (!isEligible(dateIso, holidays)) {
    return { ok: false, error: "sessions.errors.notEligible" };
  }

  const memberIds = campaign.players.map((player) => player.userId);
  const viability = await computeCampaignViabilityOnDate(memberIds, dateIso);

  let attendees: string[];
  if (attendeeIds === undefined) {
    if (viability !== "S") {
      return { ok: false, error: "sessions.errors.attendeesRequired" };
    }
    attendees = memberIds;
  } else {
    const memberIdSet = new Set(memberIds);
    const deduped = [...new Set(attendeeIds)];
    if (deduped.some((id) => !memberIdSet.has(id))) {
      return { ok: false, error: "sessions.errors.notMember" };
    }
    if (!deduped.includes(userId)) {
      return { ok: false, error: "sessions.errors.dmMustAttend" };
    }
    attendees = deduped;
  }

  const conflicts = await findConflicts(dateIso, attendees);
  if (conflicts.length > 0) {
    const [conflict] = conflicts;
    return {
      ok: false,
      error: "sessions.errors.playerConflict",
      params: {
        campaign: conflict.campaignName,
        players: conflict.sharedNames.join(", "),
      },
    };
  }

  // Tracks whether this confirmation happened on a non-S day (a DM override),
  // regardless of the attendee set chosen — internal data only, never rendered.
  const forced = viability !== "S";

  try {
    const date = toUtcDate(dateIso);
    const created = await prisma.$transaction(async (tx) => {
      const session = await tx.confirmedSession.create({
        data: {
          campaignId,
          date,
          activeDate: date,
          startTime,
          durationMinutes,
          confirmedById: userId,
          forced,
        },
        select: { id: true },
      });

      await tx.confirmedSessionAttendee.createMany({
        data: attendees.map((attendeeId) => ({
          sessionId: session.id,
          userId: attendeeId,
        })),
      });

      return session;
    });

    return {
      ok: true,
      session: {
        id: created.id,
        campaignId,
        campaignName: campaign.name,
        campaignTag: campaign.tag,
        date: dateIso,
        startTime,
        durationMinutes,
      },
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      // Double-submit race: another request confirmed the same (campaign, date)
      // between the checks above and this insert.
      return { ok: false, error: "sessions.errors.alreadyConfirmed" };
    }

    console.error("[SESSIONS/CONFIRM] Failed to confirm session:", error);
    return { ok: false, error: "sessions.errors.unknown" };
  }
}

/**
 * Loads an active session's campaign id and checks the requester is a DM of
 * it. Exported so `PUT /api/sessions/[id]` can authorize **before** parsing
 * the request body — keeping the guard ladder 401 → 404 → 403 → 400, the same
 * order used by `campaigns/[id]/route.ts` — since, unlike `confirmSession`,
 * the session id (and thus its campaign) is already known from the URL. A
 * missing session, an already-cancelled one, or a non-member all collapse
 * into "not found" (an already-cancelled session looks not-found to everyone,
 * including its own DM — cancel is soft-delete, but the REST surface treats
 * the row as gone); a member who is not a DM gets "forbidden".
 *
 * @param {string} id - The session id.
 * @param {string} userId - The requesting user.
 * @returns {Promise<{ campaignId: string; campaignName: string; campaignTag: string } | { error: string }>}
 */
export async function authorizeSessionMutation(
  id: string,
  userId: string,
): Promise<
  | { campaignId: string; campaignName: string; campaignTag: string }
  | { error: string }
> {
  const session = await prisma.confirmedSession.findFirst({
    where: { id, ...ACTIVE_SESSION },
    select: { campaignId: true, campaign: { select: { name: true, tag: true } } },
  });
  if (!session) {
    return { error: "sessions.errors.notFound" };
  }

  const role = await getCampaignRole(userId, session.campaignId);
  if (role === null) {
    return { error: "sessions.errors.notFound" };
  }
  if (role !== CampaignRole.DM) {
    return { error: "sessions.errors.forbidden" };
  }

  return {
    campaignId: session.campaignId,
    campaignName: session.campaign.name,
    campaignTag: session.campaign.tag,
  };
}

/**
 * Updates an active session's time fields — a full replace, not a partial
 * patch: passing `null` for a field clears it (how a timed session is turned
 * back into an all-day one). Campaign and date are not editable (cancel and
 * confirm again instead). Trusts the caller already authorized via
 * `authorizeSessionMutation` (mirrors `updateCampaign`, which trusts its
 * route's prior `getCampaignRole` check) — the resolved campaign identity is
 * passed in so this does not re-query it.
 *
 * @param {string} id - The session id.
 * @param {{ campaignId: string; campaignName: string; campaignTag: string }} authorized - Result of `authorizeSessionMutation`.
 * @param {{ startTime: string | null; durationMinutes: number | null }} input - The new time fields.
 * @returns {Promise<ConfirmedSessionMutationResult>} The updated session, or an error key.
 */
export async function updateSession(
  id: string,
  authorized: { campaignId: string; campaignName: string; campaignTag: string },
  input: { startTime: string | null; durationMinutes: number | null },
): Promise<ConfirmedSessionMutationResult> {
  try {
    const updated = await prisma.confirmedSession.update({
      where: { id },
      data: { startTime: input.startTime, durationMinutes: input.durationMinutes },
      select: { date: true, startTime: true, durationMinutes: true },
    });

    return {
      ok: true,
      session: {
        id,
        campaignId: authorized.campaignId,
        campaignName: authorized.campaignName,
        campaignTag: authorized.campaignTag,
        date: toIsoDate(updated.date),
        startTime: updated.startTime,
        durationMinutes: updated.durationMinutes,
      },
    };
  } catch (error) {
    console.error("[SESSIONS/UPDATE] Failed to update session:", error);
    return { ok: false, error: "sessions.errors.unknown" };
  }
}

/**
 * Cancels an active session — a soft delete: stamps `cancelledAt`/
 * `cancelledById` and frees `activeDate` (so the same campaign/day can be
 * confirmed again as a new row) rather than removing it, keeping the row for
 * the Phase 2 statistics view and #23's event cleanup. `DELETE` has no body to
 * validate, so — unlike `updateSession` — this authorizes itself via
 * `authorizeSessionMutation` rather than requiring the route to call it first.
 * Idempotent by construction: the guarded `updateMany` only ever touches an
 * active row, so a race with a concurrent cancel surfaces as "not found",
 * never a double cancellation.
 *
 * @param {string} id - The session id.
 * @param {string} userId - The requesting user (must be a DM of the campaign).
 * @returns {Promise<CancelSessionResult>} Success with the id, or an error key.
 */
export async function cancelSession(
  id: string,
  userId: string,
): Promise<CancelSessionResult> {
  const authorized = await authorizeSessionMutation(id, userId);
  if ("error" in authorized) {
    return { ok: false, error: authorized.error };
  }

  const result = await prisma.confirmedSession.updateMany({
    where: { id, ...ACTIVE_SESSION },
    data: { cancelledAt: new Date(), cancelledById: userId, activeDate: null },
  });

  if (result.count === 0) {
    return { ok: false, error: "sessions.errors.notFound" };
  }

  return { ok: true, id };
}

/**
 * Adds one member as an attendee of an active session (roadmap #22) — serves
 * both a DM-driven addition and a player's own last-minute rejoin ("Sumarme a
 * la partida"), branching on whether the actor targets themselves. The DM
 * path may add any campaign member; the self path additionally requires the
 * actor to have answered `YES` for the session's date. Both paths then reject
 * an attendee already on the list and a conflicting same-day session the
 * target already attends elsewhere, via the same `findConflicts` used by
 * `confirmSession`.
 *
 * @param {string} sessionId - The active session being joined.
 * @param {string} targetUserId - The user being added.
 * @param {string} actingUserId - The user making the request.
 * @returns {Promise<AttendeeMutationResult>} The added attendee, or an error key.
 */
export async function addAttendee(
  sessionId: string,
  targetUserId: string,
  actingUserId: string,
): Promise<AttendeeMutationResult> {
  const session = await prisma.confirmedSession.findFirst({
    where: { id: sessionId, ...ACTIVE_SESSION },
    select: { campaignId: true, date: true },
  });
  if (!session) {
    return { ok: false, error: "sessions.errors.notFound" };
  }

  const dateIso = toIsoDate(session.date);
  const isSelf = targetUserId === actingUserId;

  if (isSelf) {
    const role = await getCampaignRole(actingUserId, session.campaignId);
    if (role === null) {
      // Not a member at all — collapses into "not found" like every other
      // session-mutation guard here, hiding existence from strangers.
      return { ok: false, error: "sessions.errors.notFound" };
    }

    const availability = await prisma.availability.findUnique({
      where: { date_userId: { date: session.date, userId: actingUserId } },
      select: { status: true },
    });
    if (availability?.status !== "YES") {
      return { ok: false, error: "sessions.errors.requiresYes" };
    }
  } else {
    const actorRole = await getCampaignRole(actingUserId, session.campaignId);
    if (actorRole === null) {
      return { ok: false, error: "sessions.errors.notFound" };
    }
    if (actorRole !== CampaignRole.DM) {
      return { ok: false, error: "sessions.errors.forbidden" };
    }

    const targetRole = await getCampaignRole(targetUserId, session.campaignId);
    if (targetRole === null) {
      return { ok: false, error: "sessions.errors.notMember" };
    }
  }

  const alreadyAttending = await prisma.confirmedSessionAttendee.findUnique({
    where: { sessionId_userId: { sessionId, userId: targetUserId } },
    select: { userId: true },
  });
  if (alreadyAttending) {
    return { ok: false, error: "sessions.errors.alreadyAttending" };
  }

  const conflicts = await findConflicts(dateIso, [targetUserId], sessionId);
  if (conflicts.length > 0) {
    return {
      ok: false,
      error: "sessions.errors.attendeeConflict",
      params: { campaign: conflicts[0].campaignName },
    };
  }

  try {
    await prisma.confirmedSessionAttendee.create({
      data: { sessionId, userId: targetUserId, addedById: actingUserId },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      // Double-submit race: someone else added the same attendee first.
      return { ok: false, error: "sessions.errors.alreadyAttending" };
    }

    console.error("[SESSIONS/ADD_ATTENDEE] Failed to add attendee:", error);
    return { ok: false, error: "sessions.errors.unknown" };
  }

  return { ok: true, sessionId, userId: targetUserId };
}

/**
 * Removes one attendee from an active session (roadmap #22). DM-only, always
 * — even to remove themselves, a player can never remove themselves — reusing
 * `authorizeSessionMutation` for that guard exactly like `updateSession`/
 * `cancelSession`. Refuses to leave the session with zero attendees or with
 * no DM among the remaining attendees (`sessionRules.ts`'s `canRemoveAttendee`).
 *
 * @param {string} sessionId - The session to remove an attendee from.
 * @param {string} targetUserId - The attendee being removed.
 * @param {string} actingUserId - The requesting user (must be a DM of the campaign).
 * @returns {Promise<AttendeeMutationResult>} The removed attendee, or an error key.
 */
export async function removeAttendee(
  sessionId: string,
  targetUserId: string,
  actingUserId: string,
): Promise<AttendeeMutationResult> {
  const authorized = await authorizeSessionMutation(sessionId, actingUserId);
  if ("error" in authorized) {
    return { ok: false, error: authorized.error };
  }

  const attendeeRows = await prisma.confirmedSessionAttendee.findMany({
    where: { sessionId },
    select: { userId: true },
  });
  const attendeeIds = attendeeRows.map((row) => row.userId);
  if (!attendeeIds.includes(targetUserId)) {
    // Nothing to remove — mirrors cancelSession's "count === 0 → notFound".
    return { ok: false, error: "sessions.errors.notFound" };
  }

  const remainingIds = attendeeIds.filter((attendeeId) => attendeeId !== targetUserId);
  const remainingRoles = await prisma.campaignPlayer.findMany({
    where: { campaignId: authorized.campaignId, userId: { in: remainingIds } },
    select: { role: true },
  });
  const remainingDms = remainingRoles.filter(
    (row) => row.role === CampaignRole.DM,
  ).length;

  const verdict = canRemoveAttendee({
    actorIsDm: true, // guaranteed by authorizeSessionMutation above
    remainingAttendees: remainingIds.length,
    remainingDms,
  });
  if (!verdict.allowed) {
    return { ok: false, error: `sessions.errors.${verdict.reason}` };
  }

  try {
    await prisma.confirmedSessionAttendee.delete({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      // Race: already removed by a concurrent request.
      return { ok: false, error: "sessions.errors.notFound" };
    }

    console.error("[SESSIONS/REMOVE_ATTENDEE] Failed to remove attendee:", error);
    return { ok: false, error: "sessions.errors.unknown" };
  }

  return { ok: true, sessionId, userId: targetUserId };
}
