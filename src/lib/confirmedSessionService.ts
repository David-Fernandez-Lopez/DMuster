import { Prisma } from "@/generated/prisma/client";
import { CampaignRole } from "@/generated/prisma/enums";
import { getCampaignRole } from "@/lib/authz";
import { isEligible, toIsoDate, toUtcDate, todayIso } from "@/lib/date";
import { listHolidays } from "@/lib/holidayService";
import { prisma } from "@/lib/prisma";
import {
  findConflictingSessions,
  type SessionAttendance,
  type SessionConflict,
} from "@/lib/sessionConflict";
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

/** One attendee of a session, as shown in the attendee list. */
export type SessionAttendeeDto = {
  userId: string;
  name: string;
  /** Whether this attendee is a DM of the session's campaign. */
  isDm: boolean;
};

/** A session on the "Próximas partidas" page: the DTO plus its attendees. */
export type UpcomingSessionDto = ConfirmedSessionDto & {
  attendees: SessionAttendeeDto[];
  /** Whether the requesting user is a DM of this session's campaign. */
  viewerIsDm: boolean;
};

/** Result of a session mutation that returns the affected session. */
export type ConfirmedSessionMutationResult =
  | { ok: true; session: ConfirmedSessionDto }
  | { ok: false; error: string; params?: Record<string, string> };

/** Result of cancelling a session (soft delete — no session body to return). */
export type CancelSessionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

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
 * Lists every active confirmed session for a set of campaigns within an
 * inclusive date range, keyed by `"campaignId|YYYY-MM-DD"` for O(1) lookup
 * while the calendar builds its per-day, per-campaign viability map. One
 * batched query — no N+1 per day or per campaign.
 *
 * @param {string[]} campaignIds - Campaigns to fetch sessions for.
 * @param {string} startIso - Range start, "YYYY-MM-DD" (inclusive).
 * @param {string} endIso - Range end, "YYYY-MM-DD" (inclusive).
 * @returns {Promise<Map<string, ConfirmedSessionDto>>} Sessions keyed by campaign + day.
 */
export async function listConfirmedSessionsForCampaigns(
  campaignIds: string[],
  startIso: string,
  endIso: string,
): Promise<Map<string, ConfirmedSessionDto>> {
  const byCampaignAndDate = new Map<string, ConfirmedSessionDto>();
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
    });
  }

  return byCampaignAndDate;
}

/**
 * Lists the user's upcoming active confirmed sessions (today or later) across
 * their own campaigns, ordered by date then start time (MySQL sorts `NULL`
 * first in `ASC`, so all-day sessions lead their day) — feeds "Próximas
 * partidas". Includes each session's attendee list and whether the requesting
 * user is a DM of that campaign, so the page needs no further per-session query.
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
          players: { select: { userId: true, role: true } },
        },
      },
      attendees: { select: { userId: true, user: { select: { name: true } } } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return sessions.map((session) => {
    const roleByUser = new Map(
      session.campaign.players.map((player) => [player.userId, player.role]),
    );

    const attendees: SessionAttendeeDto[] = session.attendees
      .map((attendee) => ({
        userId: attendee.userId,
        name: attendee.user.name,
        isDm: roleByUser.get(attendee.userId) === CampaignRole.DM,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      id: session.id,
      campaignId: session.campaignId,
      campaignName: session.campaign.name,
      campaignTag: session.campaign.tag,
      date: toIsoDate(session.date),
      startTime: session.startTime,
      durationMinutes: session.durationMinutes,
      attendees,
      viewerIsDm: roleByUser.get(userId) === CampaignRole.DM,
    };
  });
}

/**
 * Confirms a campaign as playing on a given day. Guards run in order —
 * campaign exists, the user is a DM of it (both collapse a non-member into
 * "not found", mirroring `api/campaigns/[id]/players/route.ts`'s
 * `authorizeDm`, so a stranger cannot probe campaign existence), the date is
 * eligible, the campaign's viability recomputed server-side is `S`, and no
 * other active session that day shares an attendee. On success the whole
 * campaign membership becomes the attendee set (roadmap #21 — a viable day
 * means everyone plays; #22 makes this set variable) inside a transaction, so
 * the session row and its attendee rows are never created without each other.
 *
 * @param {object} input
 * @param {string} input.campaignId - The campaign being confirmed.
 * @param {string} input.dateIso - The day being confirmed, "YYYY-MM-DD".
 * @param {string | null} input.startTime - Optional "HH:MM" start time.
 * @param {number | null} input.durationMinutes - Optional duration, minutes.
 * @param {string} input.userId - The confirming user (must be a DM of the campaign).
 * @returns {Promise<ConfirmedSessionMutationResult>} The new session, or an
 *   error key (optionally with interpolation `params`).
 */
export async function confirmSession({
  campaignId,
  dateIso,
  startTime,
  durationMinutes,
  userId,
}: {
  campaignId: string;
  dateIso: string;
  startTime: string | null;
  durationMinutes: number | null;
  userId: string;
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

  const attendeeIds = campaign.players.map((player) => player.userId);

  const viability = await computeCampaignViabilityOnDate(attendeeIds, dateIso);
  if (viability !== "S") {
    return { ok: false, error: "sessions.errors.notViable" };
  }

  const conflicts = await findConflicts(dateIso, attendeeIds);
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
        },
        select: { id: true },
      });

      await tx.confirmedSessionAttendee.createMany({
        data: attendeeIds.map((attendeeId) => ({
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
