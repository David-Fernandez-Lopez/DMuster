import { env } from "@/lib/env";
import { toIsoDate, toIsoDateIn } from "@/lib/date";
import { listHolidays } from "@/lib/holidayService";
import { prisma } from "@/lib/prisma";
import { todayIso } from "@/lib/today";

import {
  answerKey,
  campaignStats,
  daysBetween,
  groupStats,
  meStats,
  type CampaignStats,
  type GroupStats,
  type MeStats,
  type StatCampaign,
  type StatContext,
  type StatSession,
} from "./metrics";
import {
  availablePeriods,
  periodBounds,
  type Period,
  type PeriodBounds,
} from "./period";

/** How far ahead of the session an attendee joins to count as a last-minute one. */
const LATE_JOIN_DAYS = 2;

/**
 * An attendee row written within this window of the session's creation is part
 * of the initial set (confirmation writes both in one transaction), not a
 * later addition.
 */
const INITIAL_ATTENDEE_WINDOW_MS = 60_000;

/** Everything loaded once per request and shared by the three views. */
type StatisticsData = {
  sessions: StatSession[];
  context: StatContext;
  /** Earliest session date, or null when nothing was ever confirmed. */
  firstDate: string | null;
};

/** Names and campaign display data for the ids a view-model refers to. */
export type StatisticsDirectory = {
  campaigns: Record<
    string,
    { tag: string; name: string; colorIndex: number; archived: boolean }
  >;
  users: Record<string, string>;
};

/** A view-model together with the directory needed to render its ids. */
export type StatisticsView<T> = { stats: T; directory: StatisticsDirectory };

/** A campaign the user belongs to, as listed in the campaign selector. */
export type MyCampaign = {
  id: string;
  tag: string;
  name: string;
  archived: boolean;
};

/**
 * Loads every session, campaign, holiday and availability answer and shapes
 * them for the pure metrics. The group is small and the history grows slowly,
 * so one read per table is cheaper and simpler than per-view queries.
 *
 * @returns {Promise<StatisticsData>} Sessions, context and the first data date.
 */
async function loadStatisticsData(): Promise<StatisticsData> {
  const timeZone = env.APP_TIMEZONE;
  const [holidayList, campaigns, sessions] = await Promise.all([
    listHolidays(),
    prisma.campaign.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tag: true,
        name: true,
        archivedAt: true,
        players: {
          select: {
            userId: true,
            role: true,
            createdAt: true,
            user: { select: { name: true } },
          },
        },
      },
    }),
    prisma.confirmedSession.findMany({
      select: {
        id: true,
        campaignId: true,
        date: true,
        startTime: true,
        durationMinutes: true,
        forced: true,
        confirmedById: true,
        createdAt: true,
        cancelledAt: true,
        cancelCauseUserId: true,
        attendees: { select: { userId: true, createdAt: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const today = todayIso();
  const holidays = new Set(holidayList.map((holiday) => holiday.date));

  const memberIds = new Set<string>();
  const names = new Map<string, string>();
  for (const campaign of campaigns) {
    for (const player of campaign.players) {
      memberIds.add(player.userId);
      names.set(player.userId, player.user.name);
    }
  }

  const statSessions: StatSession[] = sessions.map((session) => {
    const date = toIsoDate(session.date);
    return {
      id: session.id,
      campaignId: session.campaignId,
      date,
      startTime: session.startTime,
      durationMinutes: session.durationMinutes,
      status: session.cancelledAt ? "CANCELED" : "PLAYED",
      dmId: session.confirmedById,
      attendeeIds: session.attendees.map((attendee) => attendee.userId),
      forced: session.forced,
      confirmedDay: toIsoDateIn(session.createdAt, timeZone),
      cancelledDay: session.cancelledAt ? toIsoDateIn(session.cancelledAt, timeZone) : null,
      cancelCauseUserId: session.cancelCauseUserId,
      lateJoinerIds: session.attendees
        .filter(
          (attendee) =>
            attendee.createdAt.getTime() - session.createdAt.getTime() >
              INITIAL_ATTENDEE_WINDOW_MS &&
            daysBetween(toIsoDateIn(attendee.createdAt, timeZone), date) <= LATE_JOIN_DAYS,
        )
        .map((attendee) => attendee.userId),
    };
  });

  const firstDate = statSessions.length ? statSessions[0].date : null;

  const answers: StatContext["answers"] = new Map();
  if (memberIds.size > 0) {
    const rows = await prisma.availability.findMany({
      where: { userId: { in: [...memberIds] } },
      select: { userId: true, date: true, status: true, updatedAt: true },
    });
    for (const row of rows) {
      answers.set(answerKey(row.userId, toIsoDate(row.date)), {
        status: row.status,
        answeredDay: toIsoDateIn(row.updatedAt, timeZone),
      });
    }
  }

  const nextByCampaign = new Map<string, { date: string; startTime: string | null }>();
  for (const session of statSessions) {
    if (
      session.status === "PLAYED" &&
      session.date >= today &&
      !nextByCampaign.has(session.campaignId)
    ) {
      nextByCampaign.set(session.campaignId, {
        date: session.date,
        startTime: session.startTime,
      });
    }
  }

  const statCampaigns: StatCampaign[] = campaigns.map((campaign, index) => ({
    id: campaign.id,
    tag: campaign.tag,
    name: campaign.name,
    colorIndex: Math.min(index, 8),
    archivedDay: campaign.archivedAt ? toIsoDateIn(campaign.archivedAt, timeZone) : null,
    members: campaign.players.map((player) => ({
      userId: player.userId,
      name: player.user.name,
      isDm: player.role === "DM",
      joinedDay: toIsoDateIn(player.createdAt, timeZone),
    })),
    next: nextByCampaign.get(campaign.id) ?? null,
  }));

  return {
    sessions: statSessions,
    firstDate,
    context: { today, holidays, campaigns: statCampaigns, answers, names },
  };
}

/**
 * Builds the directory of campaigns and users a view-model's ids refer to.
 *
 * @param {StatContext} context - The loaded context.
 * @returns {StatisticsDirectory} Display data by id.
 */
function directoryOf(context: StatContext): StatisticsDirectory {
  return {
    campaigns: Object.fromEntries(
      context.campaigns.map((campaign) => [
        campaign.id,
        {
          tag: campaign.tag,
          name: campaign.name,
          colorIndex: campaign.colorIndex,
          archived: campaign.archivedDay !== null,
        },
      ]),
    ),
    users: Object.fromEntries(context.names),
  };
}

/**
 * Resolves the period against the loaded data.
 *
 * @param {Period} period - The selected period.
 * @param {StatisticsData} data - The loaded data.
 * @returns {PeriodBounds} The bounds.
 */
function boundsFor(period: Period, data: StatisticsData): PeriodBounds {
  return periodBounds(period, data.context.today, data.firstDate);
}

/**
 * Years with at least one session, for the period selector.
 *
 * @returns {Promise<Period[]>} "all", "last12" and one entry per year, newest first.
 */
export async function getAvailablePeriods(): Promise<Period[]> {
  const rows = await prisma.confirmedSession.findMany({
    distinct: ["date"],
    select: { date: true },
  });
  return availablePeriods(rows.map((row) => row.date.getUTCFullYear()));
}

/**
 * The group tab (everyone signed in may see it).
 *
 * @param {Period} period - The selected period.
 * @returns {Promise<StatisticsView<GroupStats>>} The view-model and its directory.
 */
export async function getGroupStats(
  period: Period,
): Promise<StatisticsView<GroupStats>> {
  const data = await loadStatisticsData();
  return {
    stats: groupStats(data.sessions, boundsFor(period, data), data.context),
    directory: directoryOf(data.context),
  };
}

/**
 * One campaign's tab. Membership is checked here, so a non-member gets the same
 * `null` as an unknown campaign and the caller answers 404.
 *
 * @param {string} campaignId - The campaign.
 * @param {string} userId - The requesting user.
 * @param {Period} period - The selected period.
 * @returns {Promise<StatisticsView<CampaignStats> | null>} The view-model, or null.
 */
export async function getCampaignStats(
  campaignId: string,
  userId: string,
  period: Period,
): Promise<StatisticsView<CampaignStats> | null> {
  const data = await loadStatisticsData();
  const campaign = data.context.campaigns.find((candidate) => candidate.id === campaignId);
  if (!campaign?.members.some((member) => member.userId === userId)) {
    return null;
  }
  const stats = campaignStats(campaignId, data.sessions, boundsFor(period, data), data.context);
  return stats ? { stats, directory: directoryOf(data.context) } : null;
}

/**
 * The "Yo" tab.
 *
 * @param {string} userId - The requesting user.
 * @param {Period} period - The selected period.
 * @returns {Promise<StatisticsView<MeStats>>} The view-model and its directory.
 */
export async function getMeStats(
  userId: string,
  period: Period,
): Promise<StatisticsView<MeStats>> {
  const data = await loadStatisticsData();
  return {
    stats: meStats(userId, data.sessions, boundsFor(period, data), data.context),
    directory: directoryOf(data.context),
  };
}

/**
 * The campaigns a user belongs to, for the campaign selector, archived ones
 * last. The roster's order is creation order, which keeps the selector stable.
 *
 * @param {string} userId - The user.
 * @returns {Promise<MyCampaign[]>} Their campaigns.
 */
export async function listMyCampaigns(userId: string): Promise<MyCampaign[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { players: { some: { userId } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, tag: true, name: true, archivedAt: true },
  });
  return campaigns
    .map((campaign) => ({
      id: campaign.id,
      tag: campaign.tag,
      name: campaign.name,
      archived: campaign.archivedAt !== null,
    }))
    .sort((a, b) => Number(a.archived) - Number(b.archived));
}
