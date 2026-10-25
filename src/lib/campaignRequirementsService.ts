import { Prisma } from "@/generated/prisma/client";
import { CampaignRole } from "@/generated/prisma/enums";
import {
  DEFAULT_REQUIREMENTS_WINDOW,
  resolveRequirementsWindow,
  type AnchorCandidate,
  type RequirementsWindow,
} from "@/lib/campaignRequirements";
import { toIsoDate, toIsoDateIn, toUtcDate } from "@/lib/date";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { lockRow } from "@/lib/rowLock";
import { todayIso } from "@/lib/today";
import type { CampaignRequirementsInput } from "@/lib/validation/campaign";

/** Prisma error code raised when a record to update does not exist. */
const RECORD_NOT_FOUND = "P2025";

/** A player of the campaign as shown in the requirements form. */
export type RequirementsPlayer = {
  userId: string;
  name: string;
  /** Whether the requirements in force need this player (always, by default). */
  required: boolean;
};

/** A campaign's requirements as the DM edits them (serializable to the client). */
export type CampaignRequirementsView = {
  /** Whether custom requirements are in force, and until which day. */
  window: RequirementsWindow;
  /** The minimum number of players in force, or `null` for none. */
  minPlayers: number | null;
  /** Every player (DMs excluded — they are always required), sorted by name. */
  players: RequirementsPlayer[];
};

/** Result of a requirements mutation. `error` holds an i18n key on failure. */
export type CampaignRequirementsMutationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Resolves the requirements window of several campaigns at once: which have
 * custom requirements in force and up to which day (see
 * `resolveRequirementsWindow`). Campaigns on the default rule cost nothing;
 * for the rest, a **single** query loads their active sessions dated on or
 * after the day each saved its requirements — the only ones that can anchor
 * them — so callers iterating over many campaigns add one query, not one per
 * campaign.
 *
 * @param {ReadonlyArray<{ id: string; requirementsSetAt: Date | null }>} campaigns -
 *   The campaigns, with when their requirements were saved.
 * @returns {Promise<Map<string, RequirementsWindow>>} The window of every
 *   campaign passed in, keyed by campaign id.
 */
export async function loadRequirementWindows(
  campaigns: ReadonlyArray<{ id: string; requirementsSetAt: Date | null }>,
): Promise<Map<string, RequirementsWindow>> {
  const windows = new Map<string, RequirementsWindow>(
    campaigns.map((campaign) => [campaign.id, DEFAULT_REQUIREMENTS_WINDOW]),
  );

  const customised = campaigns.flatMap((campaign) =>
    campaign.requirementsSetAt === null
      ? []
      : [{ id: campaign.id, setAt: campaign.requirementsSetAt }],
  );
  if (customised.length === 0) {
    return windows;
  }

  const sessions = await prisma.confirmedSession.findMany({
    where: {
      cancelledAt: null,
      OR: customised.map((campaign) => ({
        campaignId: campaign.id,
        date: { gte: toUtcDate(toIsoDateIn(campaign.setAt, env.APP_TIMEZONE)) },
      })),
    },
    select: { campaignId: true, date: true, createdAt: true },
  });

  const sessionsByCampaign = new Map<string, AnchorCandidate[]>();
  for (const session of sessions) {
    const candidate = { date: toIsoDate(session.date), createdAt: session.createdAt };
    const list = sessionsByCampaign.get(session.campaignId);
    if (list) {
      list.push(candidate);
    } else {
      sessionsByCampaign.set(session.campaignId, [candidate]);
    }
  }

  const today = todayIso();
  for (const campaign of customised) {
    windows.set(
      campaign.id,
      resolveRequirementsWindow({
        setAt: campaign.setAt,
        sessions: sessionsByCampaign.get(campaign.id) ?? [],
        today,
        timeZone: env.APP_TIMEZONE,
      }),
    );
  }
  return windows;
}

/**
 * Loads a campaign's requirements for the DM's edit form. Requirements that
 * were never saved, or that expired when their session passed, read as the
 * default: every player required and no minimum — so the form never offers to
 * keep a stale setting.
 *
 * @param {string} campaignId - The campaign whose requirements are read.
 * @returns {Promise<CampaignRequirementsView | null>} The requirements, or
 *   `null` when the campaign does not exist.
 */
export async function getCampaignRequirements(
  campaignId: string,
): Promise<CampaignRequirementsView | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      minPlayers: true,
      requirementsSetAt: true,
      players: {
        where: { role: CampaignRole.PLAYER },
        select: { userId: true, optional: true, user: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      },
    },
  });
  if (!campaign) {
    return null;
  }

  const window =
    (await loadRequirementWindows([campaign])).get(campaign.id) ??
    DEFAULT_REQUIREMENTS_WINDOW;

  return {
    window,
    minPlayers: window.active ? campaign.minPlayers : null,
    players: campaign.players.map((player) => ({
      userId: player.userId,
      name: player.user.name,
      required: !window.active || !player.optional,
    })),
  };
}

/**
 * Saves a campaign's requirements for its next session: the players listed
 * are required and every other player becomes optional, with an optional
 * minimum number of players. Saving stamps `requirementsSetAt`, which starts
 * the window anew — it runs until the next session confirmed after this save
 * has passed.
 *
 * Refused with an i18n key when an id is not a player of the campaign
 * (`notPlayer`), when the minimum exceeds the number of players
 * (`minTooHigh`), or when nothing would be required at all — no required
 * player and no minimum, so the DM alone would make any day viable
 * (`empty`). Requiring every player with no minimum is the default rule, so
 * it is stored as a reset instead of opening a window that changes nothing.
 *
 * Runs under a lock on the campaign row so a player added or removed at the
 * same moment cannot slip between the membership check and the writes.
 *
 * @param {string} campaignId - The campaign being configured.
 * @param {CampaignRequirementsInput} input - The required players and minimum.
 * @returns {Promise<CampaignRequirementsMutationResult>} Success, or an error key.
 */
export async function setCampaignRequirements(
  campaignId: string,
  input: CampaignRequirementsInput,
): Promise<CampaignRequirementsMutationResult> {
  try {
    return await prisma.$transaction(
      async (tx): Promise<CampaignRequirementsMutationResult> => {
        await lockRow(tx, "campaign", campaignId);

        const players = await tx.campaignPlayer.findMany({
          where: { campaignId, role: CampaignRole.PLAYER },
          select: { userId: true },
        });
        const playerIds = new Set(players.map((player) => player.userId));
        const requiredIds = new Set(input.requiredUserIds);

        if ([...requiredIds].some((id) => !playerIds.has(id))) {
          return { ok: false, error: "campaigns.requirements.errors.notPlayer" };
        }
        if (input.minPlayers !== null && input.minPlayers > playerIds.size) {
          return { ok: false, error: "campaigns.requirements.errors.minTooHigh" };
        }
        if (requiredIds.size === playerIds.size && input.minPlayers === null) {
          await clearRequirements(tx, campaignId);
          return { ok: true };
        }
        if (requiredIds.size === 0 && input.minPlayers === null) {
          return { ok: false, error: "campaigns.requirements.errors.empty" };
        }

        const optionalIds = [...playerIds].filter((id) => !requiredIds.has(id));
        await tx.campaignPlayer.updateMany({
          where: { campaignId, userId: { notIn: optionalIds } },
          data: { optional: false },
        });
        await tx.campaignPlayer.updateMany({
          where: { campaignId, userId: { in: optionalIds } },
          data: { optional: true },
        });
        await tx.campaign.update({
          where: { id: campaignId },
          data: { minPlayers: input.minPlayers, requirementsSetAt: new Date() },
          select: { id: true },
        });

        return { ok: true };
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return { ok: false, error: "campaigns.errors.notFound" };
    }

    console.error(
      `[CAMPAIGN_REQUIREMENTS/SET] Failed to save requirements for campaign ${campaignId}:`,
      error,
    );
    return { ok: false, error: "campaigns.errors.unknown" };
  }
}

/**
 * Puts a campaign back on the default rule: every member required, no
 * minimum, no window.
 *
 * @param {Prisma.TransactionClient} tx - The transaction to write in.
 * @param {string} campaignId - The campaign to reset.
 */
async function clearRequirements(
  tx: Prisma.TransactionClient,
  campaignId: string,
): Promise<void> {
  await tx.campaignPlayer.updateMany({
    where: { campaignId, optional: true },
    data: { optional: false },
  });
  await tx.campaign.update({
    where: { id: campaignId },
    data: { minPlayers: null, requirementsSetAt: null },
    select: { id: true },
  });
}

/**
 * Resets a campaign's requirements to the default rule (every member
 * required, no minimum) before they would expire on their own.
 *
 * @param {string} campaignId - The campaign to reset.
 * @returns {Promise<CampaignRequirementsMutationResult>} Success, or an error key.
 */
export async function resetCampaignRequirements(
  campaignId: string,
): Promise<CampaignRequirementsMutationResult> {
  try {
    await prisma.$transaction(async (tx) => {
      await lockRow(tx, "campaign", campaignId);
      await clearRequirements(tx, campaignId);
    });
    return { ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return { ok: false, error: "campaigns.errors.notFound" };
    }

    console.error(
      `[CAMPAIGN_REQUIREMENTS/RESET] Failed to reset requirements for campaign ${campaignId}:`,
      error,
    );
    return { ok: false, error: "campaigns.errors.unknown" };
  }
}
