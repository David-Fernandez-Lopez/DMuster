import { CampaignRole } from "@/generated/prisma/enums";
import { addDays, isEligible, toIsoDate, toUtcDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { computeViability, type Viability } from "@/lib/viability";

/**
 * A single member's resolved response for a day, as consumed by the calendar UI.
 * `null` is the derived pending state (no stored row). Declared as a plain string
 * union (not the Prisma enum) so client components can import this type without
 * pulling Prisma into the browser bundle.
 */
export type PlayerStatusValue = "YES" | "NO" | "MAYBE" | null;

/** A campaign member's status for a day, for the day-detail breakdown. */
export type PlayerDayStatus = {
  userId: string;
  name: string;
  /** True when this member is a DM of the campaign (shows the "Máster" badge). */
  isDm: boolean;
  status: PlayerStatusValue;
};

/** One campaign's viability for one day, with its per-member breakdown. */
export type CampaignDayViability = {
  campaignId: string;
  name: string;
  tag: string;
  viability: Viability;
  /** Every member of the campaign, sorted by name. */
  players: PlayerDayStatus[];
};

/** A campaign the user belongs to, for the calendar filter chips. */
export type CalendarCampaign = { id: string; name: string; tag: string };

/** The calendar's viability model for a visible range (serializable to the client). */
export type CalendarViability = {
  /** The user's campaigns, sorted by name — the filter chips. */
  campaigns: CalendarCampaign[];
  /** Per eligible date, the viability of each of the user's campaigns. */
  byDate: Record<string, CampaignDayViability[]>;
};

/**
 * Computes, for every eligible day in an inclusive range, the viability of each
 * campaign the user belongs to (DM or player) together with the per-member
 * breakdown feeding the day modal. Scoped to the user's own campaigns only, per
 * the locked calendar-scope decision.
 *
 * All the data is fetched in **two batched queries** (the user's campaigns with
 * their members, then every relevant member's availability rows in range) and
 * combined in memory — no per-day or per-campaign query, so there is no N+1.
 * `undefined`/missing responses collapse to the pending "T" tier via
 * `computeViability`.
 *
 * @param {string} userId - The logged-in user whose campaigns are shown.
 * @param {string} startIso - Range start, "YYYY-MM-DD" (inclusive).
 * @param {string} endIso - Range end, "YYYY-MM-DD" (inclusive).
 * @param {Set<string>} holidays - Holiday dates ("YYYY-MM-DD") for eligibility.
 * @returns {Promise<CalendarViability>} The user's campaigns and the per-date,
 *   per-campaign viability map.
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

  const byDate: Record<string, CampaignDayViability[]> = {};
  for (let iso = startIso; iso <= endIso; iso = addDays(iso, 1)) {
    if (!isEligible(iso, holidays)) {
      continue;
    }
    const dayStatuses = statusByDate.get(iso);
    byDate[iso] = campaigns.map((campaign) => {
      const players = campaign.players
        .map((player) => ({
          userId: player.userId,
          name: player.user.name,
          isDm: player.role === CampaignRole.DM,
          status: dayStatuses?.get(player.userId) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        campaignId: campaign.id,
        name: campaign.name,
        tag: campaign.tag,
        viability: computeViability(players.map((p) => p.status ?? undefined)),
        players,
      };
    });
  }

  return {
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, tag: c.tag })),
    byDate,
  };
}
