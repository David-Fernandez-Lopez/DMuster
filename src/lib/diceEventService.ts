import { Prisma } from "@/generated/prisma/client";
import type { CampaignRole, DiceEventKind } from "@/generated/prisma/enums";
import { toIsoDate, toUtcDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { nowStamp, todayIso } from "@/lib/today";
import type {
  DiceEventCreateInput,
  DiceEventFilters,
  DiceEventInput,
} from "@/lib/validation/diceEvent";

/** Prisma error code raised when a record to update/delete does not exist. */
const RECORD_NOT_FOUND = "P2025";

/** Upper bound on the entries the table view loads in one go (far above any real log). */
const TABLE_ENTRY_LIMIT = 5000;

/** Upper bound on skill suggestions returned for a campaign. */
const SKILL_SUGGESTION_LIMIT = 50;

/** One row of the critical/fumble log, ready for the UI. */
export type DiceEventRow = {
  id: string;
  campaignId: string;
  campaignName: string;
  campaignTag: string;
  campaignColorSlot: number;
  userId: string;
  userName: string;
  kind: DiceEventKind;
  skill: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" or `null`. */
  time: string | null;
  arc: { id: string; number: number; name: string | null } | null;
  sessionId: string | null;
  createdByName: string;
};

/** A page of the log plus the total matching the filters. */
export type DiceEventPage = {
  items: DiceEventRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** A campaign the viewer belongs to, with what the log form and filters need. */
export type DiceEventCampaignContext = {
  id: string;
  name: string;
  tag: string;
  colorSlot: number;
  members: { userId: string; name: string; role: CampaignRole }[];
  arcs: { id: string; number: number; name: string | null }[];
};

/** Result of a mutation. `error` holds an i18n key on failure. */
export type DiceEventMutationResult =
  | { ok: true; eventId: string }
  | { ok: false; error: string };

/** Columns read for a log row. */
const ROW_SELECT = {
  id: true,
  campaignId: true,
  userId: true,
  kind: true,
  skill: true,
  date: true,
  time: true,
  sessionId: true,
  campaign: { select: { name: true, tag: true, colorSlot: true } },
  user: { select: { name: true } },
  createdBy: { select: { name: true } },
  arc: { select: { id: true, number: true, name: true } },
} satisfies Prisma.DiceEventSelect;

/**
 * Builds the `where` of a log query: only campaigns the viewer belongs to, plus
 * the optional filters.
 *
 * @param {string} viewerId - Id of the signed-in user.
 * @param {DiceEventFilters} filters - Optional campaign/player/kind/arc filters.
 * @returns {Prisma.DiceEventWhereInput} The `where` clause.
 */
function buildWhere(viewerId: string, filters: DiceEventFilters): Prisma.DiceEventWhereInput {
  return {
    campaign: { players: { some: { userId: viewerId } } },
    ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.arcId ? { arcId: filters.arcId } : {}),
  };
}

/**
 * Flattens a database row into the shape the UI uses.
 *
 * @param {Prisma.DiceEventGetPayload<{ select: typeof ROW_SELECT }>} row - The row as read.
 * @returns {DiceEventRow} The UI row.
 */
function toRow(row: Prisma.DiceEventGetPayload<{ select: typeof ROW_SELECT }>): DiceEventRow {
  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignName: row.campaign.name,
    campaignTag: row.campaign.tag,
    campaignColorSlot: row.campaign.colorSlot,
    userId: row.userId,
    userName: row.user.name,
    kind: row.kind,
    skill: row.skill,
    date: toIsoDate(row.date),
    time: row.time,
    arc: row.arc,
    sessionId: row.sessionId,
    createdByName: row.createdBy.name,
  };
}

/**
 * Lists the log entries the viewer may see: those of any campaign they belong
 * to (any member sees everything in their campaigns). Used by the global
 * `/rolls` page and, with `campaignId`, by a campaign's tab. A `campaignId` the
 * viewer does not belong to simply matches nothing. Newest first.
 *
 * @param {string} viewerId - Id of the signed-in user.
 * @param {DiceEventFilters} filters - Optional campaign/player/kind/arc filters and paging.
 * @returns {Promise<DiceEventPage>} The requested page and the total count.
 */
export async function listDiceEvents(
  viewerId: string,
  filters: DiceEventFilters,
): Promise<DiceEventPage> {
  const where = buildWhere(viewerId, filters);

  const [total, rows] = await Promise.all([
    prisma.diceEvent.count({ where }),
    prisma.diceEvent.findMany({
      where,
      orderBy: [{ date: "desc" }, { time: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: ROW_SELECT,
    }),
  ]);

  return {
    items: rows.map(toRow),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

/**
 * Lists every entry matching the filters, oldest first, with no paging: the
 * table view needs the whole log so its column totals are complete. Capped far
 * above any real log as a guard. `page` and `pageSize` in the filters are
 * ignored.
 *
 * @param {string} viewerId - Id of the signed-in user.
 * @param {DiceEventFilters} filters - Optional campaign/player/kind/arc filters.
 * @returns {Promise<DiceEventRow[]>} The matching entries, chronologically.
 */
export async function listAllDiceEvents(
  viewerId: string,
  filters: DiceEventFilters,
): Promise<DiceEventRow[]> {
  const rows = await prisma.diceEvent.findMany({
    where: buildWhere(viewerId, filters),
    orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: TABLE_ENTRY_LIMIT,
    select: ROW_SELECT,
  });
  return rows.map(toRow);
}

/**
 * Lists the campaigns the viewer belongs to with their members and arcs: the
 * options of the log form and filters. Campaigns by name, members by name, arcs
 * in order.
 *
 * @param {string} viewerId - Id of the signed-in user.
 * @returns {Promise<DiceEventCampaignContext[]>} The viewer's campaigns.
 */
export async function listDiceEventContext(
  viewerId: string,
): Promise<DiceEventCampaignContext[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { players: { some: { userId: viewerId } } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      tag: true,
      colorSlot: true,
      players: {
        select: { role: true, user: { select: { id: true, name: true } } },
        orderBy: { user: { name: "asc" } },
      },
      arcs: {
        select: { id: true, number: true, name: true },
        orderBy: { number: "asc" },
      },
    },
  });

  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    tag: campaign.tag,
    colorSlot: campaign.colorSlot,
    members: campaign.players.map((player) => ({
      userId: player.user.id,
      name: player.user.name,
      role: player.role,
    })),
    arcs: campaign.arcs,
  }));
}

/**
 * Returns the campaign an event belongs to, so a route can authorise the
 * caller against that campaign before touching the event.
 *
 * @param {string} eventId - Id of the event.
 * @returns {Promise<string | null>} The campaign id, or `null` when it does not exist.
 */
export async function getDiceEventCampaignId(eventId: string): Promise<string | null> {
  const event = await prisma.diceEvent.findUnique({
    where: { id: eventId },
    select: { campaignId: true },
  });
  return event?.campaignId ?? null;
}

/**
 * Lists the skills already used in a campaign, most used first, to suggest as
 * the user types. Grouping uses the column collation, so accent variants fall
 * together.
 *
 * @param {string} campaignId - Id of the campaign.
 * @returns {Promise<string[]>} Up to 50 skill names.
 */
export async function listCampaignSkills(campaignId: string): Promise<string[]> {
  const groups = await prisma.diceEvent.groupBy({
    by: ["skill"],
    where: { campaignId },
    _count: { skill: true },
    orderBy: [{ _count: { skill: "desc" } }, { skill: "asc" }],
    take: SKILL_SUGGESTION_LIMIT,
  });
  return groups.map((group) => group.skill);
}

/**
 * Checks everything an input references: the player belongs to the campaign,
 * the date (when one is being set) is not in the future, and the optional arc
 * and session belong to the same campaign. Returns the i18n error key of the
 * first failure.
 *
 * @param {string} campaignId - Campaign the event belongs to.
 * @param {DiceEventCreateInput & { date?: string }} input - Validated payload.
 * @returns {Promise<string | null>} An error key, or `null` when all is fine.
 */
async function checkReferences(
  campaignId: string,
  input: DiceEventCreateInput & { date?: string },
): Promise<string | null> {
  if (input.date !== undefined && input.date > todayIso()) {
    return "diceEvents.errors.futureDate";
  }

  const member = await prisma.campaignPlayer.findUnique({
    where: { campaignId_userId: { campaignId, userId: input.userId } },
    select: { userId: true },
  });
  if (!member) {
    return "diceEvents.errors.playerNotMember";
  }

  if (input.arcId) {
    const arc = await prisma.campaignArc.findFirst({
      where: { id: input.arcId, campaignId },
      select: { id: true },
    });
    if (!arc) {
      return "diceEvents.errors.arcNotFound";
    }
  }

  if (input.sessionId) {
    const session = await prisma.confirmedSession.findFirst({
      where: { id: input.sessionId, campaignId },
      select: { id: true },
    });
    if (!session) {
      return "diceEvents.errors.sessionNotFound";
    }
  }

  return null;
}

/**
 * Records a critical or fumble, stamped with the current date and time in the
 * app's timezone (nobody types them). Any member of the campaign may record one
 * for any member (the caller has already checked the actor's membership).
 *
 * @param {string} campaignId - Campaign the event belongs to.
 * @param {string} actorId - User typing it in (audit).
 * @param {DiceEventCreateInput} input - Validated payload.
 * @returns {Promise<DiceEventMutationResult>} The new id, or an error key.
 */
export async function createDiceEvent(
  campaignId: string,
  actorId: string,
  input: DiceEventCreateInput,
): Promise<DiceEventMutationResult> {
  try {
    const invalid = await checkReferences(campaignId, input);
    if (invalid) {
      return { ok: false, error: invalid };
    }

    const stamp = nowStamp();
    const created = await prisma.diceEvent.create({
      data: {
        campaignId,
        userId: input.userId,
        kind: input.kind,
        skill: input.skill,
        date: toUtcDate(stamp.date),
        time: stamp.time,
        arcId: input.arcId ?? null,
        sessionId: input.sessionId ?? null,
        createdById: actorId,
      },
      select: { id: true },
    });
    return { ok: true, eventId: created.id };
  } catch (error) {
    console.error("[DICE_EVENTS/CREATE] Failed to create event:", error);
    return { ok: false, error: "diceEvents.errors.unknown" };
  }
}

/**
 * Replaces an event's editable fields (full replace). The campaign never
 * changes, and the audit `createdById` keeps the original author.
 *
 * @param {string} eventId - Id of the event.
 * @param {string} campaignId - Campaign the event belongs to (already resolved by the caller).
 * @param {DiceEventInput} input - Validated payload.
 * @returns {Promise<DiceEventMutationResult>} The id, or an error key.
 */
export async function updateDiceEvent(
  eventId: string,
  campaignId: string,
  input: DiceEventInput,
): Promise<DiceEventMutationResult> {
  try {
    const invalid = await checkReferences(campaignId, input);
    if (invalid) {
      return { ok: false, error: invalid };
    }

    await prisma.diceEvent.update({
      where: { id: eventId },
      data: {
        userId: input.userId,
        kind: input.kind,
        skill: input.skill,
        date: toUtcDate(input.date),
        time: input.time ?? null,
        arcId: input.arcId ?? null,
        sessionId: input.sessionId ?? null,
      },
      select: { id: true },
    });
    return { ok: true, eventId };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return { ok: false, error: "diceEvents.errors.notFound" };
    }
    console.error("[DICE_EVENTS/UPDATE] Failed to update event:", error);
    return { ok: false, error: "diceEvents.errors.unknown" };
  }
}

/**
 * Deletes an event.
 *
 * @param {string} eventId - Id of the event.
 * @returns {Promise<DiceEventMutationResult>} The id, or an error key.
 */
export async function deleteDiceEvent(eventId: string): Promise<DiceEventMutationResult> {
  try {
    await prisma.diceEvent.delete({ where: { id: eventId }, select: { id: true } });
    return { ok: true, eventId };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return { ok: false, error: "diceEvents.errors.notFound" };
    }
    console.error("[DICE_EVENTS/DELETE] Failed to delete event:", error);
    return { ok: false, error: "diceEvents.errors.unknown" };
  }
}
