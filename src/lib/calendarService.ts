import { CampaignRole } from "@/generated/prisma/enums";
import {
  type ActiveSessionRecord,
  type ConfirmedSessionDetailDto,
  type ConfirmedSessionDto,
  listActiveSessions,
} from "@/lib/confirmedSessionService";
import { addDays, isEligible, toIsoDate, toUtcDate } from "@/lib/date";
import { todayIso } from "@/lib/today";
import { prisma } from "@/lib/prisma";
import {
  buildBusyIndex,
  type BusySession,
  findBusySession,
} from "@/lib/sessionConflict";
import { canSelfJoin } from "@/lib/sessionRules";
import {
  computeViability,
  resolveMemberAvailability,
  type ResponseStatus,
  type Viability,
} from "@/lib/viability";

/**
 * A single member's resolved response for a day, as consumed by the calendar UI.
 * `null` is the derived pending state (no stored row). Built on the plain string
 * union from `viability.ts` (not the Prisma enum) so client components can import
 * this type without pulling Prisma into the browser bundle.
 */
export type PlayerStatusValue = ResponseStatus | null;

/** A campaign member's status for a day, for the day-detail breakdown. */
export type PlayerDayStatus = {
  userId: string;
  name: string;
  /** True when this member is a DM of the campaign (shows the "Máster" badge). */
  isDm: boolean;
  status: PlayerStatusValue;
  /**
   * The other campaign whose active session this member already attends that
   * day, or `null` when they are free for this campaign. A busy member makes
   * the campaign's viability `B`, whatever they answered.
   */
  busyIn: BusySession | null;
};

/** One campaign's viability for one day, with its per-member breakdown. */
export type CampaignDayViability = {
  campaignId: string;
  name: string;
  tag: string;
  viability: Viability;
  /** Every member of the campaign, sorted by name. */
  players: PlayerDayStatus[];
  /**
   * The active confirmed session for this campaign on this day, if any
   * (roadmap #21), enriched with its attendee list and the viewer's
   * self-join affordance (roadmap #22).
   */
  confirmedSession: ConfirmedSessionDetailDto | null;
};

/** A campaign the user belongs to, for the calendar filter chips. */
export type CalendarCampaign = { id: string; name: string; tag: string };

/** A DM of one of the user's campaigns, for the calendar's master filter. */
export type CalendarMaster = { userId: string; name: string };

/**
 * An active session of a campaign the user does **not** belong to, shown
 * read-only in the calendar so the user can see why their own campaigns are
 * busy that day. Carries the players' names only, never their ids.
 */
export type ForeignSessionDto = ConfirmedSessionDto & {
  /** The attendees' names, sorted. */
  playerNames: string[];
};

/** The calendar's viability model for a visible range (serializable to the client). */
export type CalendarViability = {
  /** The user's campaigns, sorted by name — the filter chips. */
  campaigns: CalendarCampaign[];
  /** The distinct DMs across the user's campaigns, sorted by name — master filter options. */
  masters: CalendarMaster[];
  /** Per eligible date, the viability of each of the user's campaigns. */
  byDate: Record<string, CampaignDayViability[]>;
  /**
   * Per eligible date that has any, the active sessions of campaigns the user
   * does not belong to, ordered by start time (all-day first).
   */
  foreignSessionsByDate: Record<string, ForeignSessionDto[]>;
};

/**
 * Builds the client-facing view of another campaign's session: the DTO fields
 * picked one by one (so the attendee ids that `ActiveSessionRecord` carries
 * never reach the browser) plus the attendees' sorted names.
 *
 * @param {ActiveSessionRecord} session - An active session the user is not a
 *   member of.
 * @returns {ForeignSessionDto} The read-only session summary.
 */
function toForeignSession(session: ActiveSessionRecord): ForeignSessionDto {
  return {
    id: session.id,
    campaignId: session.campaignId,
    campaignName: session.campaignName,
    campaignTag: session.campaignTag,
    date: session.date,
    startTime: session.startTime,
    durationMinutes: session.durationMinutes,
    playerNames: session.attendeeIds
      .map((id) => session.attendeeNames[id])
      .sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Computes, for every eligible day in an inclusive range, the viability of each
 * campaign the user belongs to (DM or player) together with the per-member
 * breakdown feeding the day modal. Viability is computed for the user's own
 * campaigns only, but it looks at the active sessions of **every** campaign,
 * because a member already attending another campaign's session that day is
 * busy, which makes the campaign `B`. The sessions of campaigns the user is not
 * in are also returned, in full (name, time, players), so the calendar can show
 * what is taking those members.
 *
 * All the data is fetched in **three batched queries** (the user's campaigns
 * with their members, every relevant member's availability rows in range, and
 * every active confirmed session in range across all campaigns) and combined in
 * memory — no per-day or per-campaign query, so there is no N+1.
 * `undefined`/missing responses collapse to the pending "T" tier via
 * `computeViability`.
 *
 * @param {string} userId - The logged-in user whose campaigns are shown.
 * @param {string} startIso - Range start, "YYYY-MM-DD" (inclusive).
 * @param {string} endIso - Range end, "YYYY-MM-DD" (inclusive).
 * @param {Set<string>} holidays - Holiday dates ("YYYY-MM-DD") for eligibility.
 * @returns {Promise<CalendarViability>} The user's campaigns, the distinct DMs
 *   across them, the per-date, per-campaign viability map, and the per-date
 *   sessions of other campaigns.
 */
export async function getCalendarViability(
  userId: string,
  startIso: string,
  endIso: string,
  holidays: Set<string>,
): Promise<CalendarViability> {
  const campaigns = await prisma.campaign.findMany({
    where: { players: { some: { userId } } },
    select: {
      id: true,
      name: true,
      tag: true,
      players: {
        select: { userId: true, role: true, user: { select: { name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  // Every distinct member across the user's campaigns — the availability rows we
  // need. A single `in` query avoids one lookup per campaign or per day.
  const memberIds = new Set<string>();
  for (const campaign of campaigns) {
    for (const player of campaign.players) {
      memberIds.add(player.userId);
    }
  }

  const rows =
    memberIds.size === 0
      ? []
      : await prisma.availability.findMany({
          where: {
            userId: { in: [...memberIds] },
            date: { gte: toUtcDate(startIso), lte: toUtcDate(endIso) },
          },
          select: { userId: true, date: true, status: true },
        });

  // date -> every active session that day, across all campaigns.
  const sessionsByDate = new Map<string, ActiveSessionRecord[]>();
  for (const session of await listActiveSessions(startIso, endIso)) {
    const daySessions = sessionsByDate.get(session.date);
    if (daySessions) {
      daySessions.push(session);
    } else {
      sessionsByDate.set(session.date, [session]);
    }
  }

  // date -> (userId -> stored status), for O(1) lookup while combining.
  const statusByDate = new Map<string, Map<string, PlayerStatusValue>>();
  for (const row of rows) {
    const iso = toIsoDate(row.date);
    let dayMap = statusByDate.get(iso);
    if (!dayMap) {
      dayMap = new Map();
      statusByDate.set(iso, dayMap);
    }
    dayMap.set(row.userId, row.status);
  }

  const ownCampaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const byDate: Record<string, CampaignDayViability[]> = {};
  const foreignSessionsByDate: Record<string, ForeignSessionDto[]> = {};
  const today = todayIso();
  for (let iso = startIso; iso <= endIso; iso = addDays(iso, 1)) {
    if (!isEligible(iso, holidays)) {
      continue;
    }
    const dayStatuses = statusByDate.get(iso);
    const daySessions = sessionsByDate.get(iso) ?? [];

    // Who attends which campaign's session this day, across every campaign:
    // the source of each member's `busyIn` and of the viewer's self-join block.
    const busyIndex = buildBusyIndex(daySessions);
    const sessionByCampaign = new Map(
      daySessions.map((session) => [session.campaignId, session]),
    );

    const foreignSessions = daySessions
      .filter((session) => !ownCampaignIds.has(session.campaignId))
      .map(toForeignSession);
    if (foreignSessions.length > 0) {
      foreignSessionsByDate[iso] = foreignSessions;
    }

    byDate[iso] = campaigns.map((campaign) => {
      const players = campaign.players
        .map((player) => ({
          userId: player.userId,
          name: player.user.name,
          isDm: player.role === CampaignRole.DM,
          status: dayStatuses?.get(player.userId) ?? null,
          busyIn: findBusySession(busyIndex, player.userId, campaign.id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const sessionRecord = sessionByCampaign.get(campaign.id) ?? null;
      let confirmedSession: ConfirmedSessionDetailDto | null = null;
      if (sessionRecord) {
        const attendeeIdSet = new Set(sessionRecord.attendeeIds);
        const attendees = players.filter((player) => attendeeIdSet.has(player.userId));

        const viewerRow = players.find((player) => player.userId === userId);
        const viewerCanJoin = canSelfJoin({
          isMember: viewerRow !== undefined,
          isAttendee: attendeeIdSet.has(userId),
          status: viewerRow?.status ?? null,
          sessionActive: true,
          isPast: iso < today,
        });
        // A viewer who already attends a different campaign's session this
        // day cannot self-join here; the blocking campaign is named inline.
        const viewerBusy = viewerRow?.busyIn ?? null;

        confirmedSession = {
          id: sessionRecord.id,
          campaignId: sessionRecord.campaignId,
          campaignName: sessionRecord.campaignName,
          campaignTag: sessionRecord.campaignTag,
          date: sessionRecord.date,
          startTime: sessionRecord.startTime,
          durationMinutes: sessionRecord.durationMinutes,
          attendees,
          viewerCanSelfJoin: viewerCanJoin && viewerBusy === null,
          viewerSelfJoinBlockedBy:
            viewerCanJoin && viewerBusy ? viewerBusy.campaignName : null,
        };
      }

      return {
        campaignId: campaign.id,
        name: campaign.name,
        tag: campaign.tag,
        viability: computeViability(
          players.map((p) => resolveMemberAvailability(p.status, p.busyIn !== null)),
        ),
        players,
        confirmedSession,
      };
    });
  }

  // The distinct DMs across the user's campaigns, deduped by userId and sorted
  // by name — the options for the calendar's master filter. Built from the
  // members already fetched above, so it adds no query.
  const mastersByUser = new Map<string, string>();
  for (const campaign of campaigns) {
    for (const player of campaign.players) {
      if (player.role === CampaignRole.DM) {
        mastersByUser.set(player.userId, player.user.name);
      }
    }
  }
  const masters: CalendarMaster[] = [...mastersByUser]
    .map(([userId, name]) => ({ userId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, tag: c.tag })),
    masters,
    byDate,
    foreignSessionsByDate,
  };
}
