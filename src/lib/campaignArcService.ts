import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockRow } from "@/lib/rowLock";
import type { CampaignArcInput } from "@/lib/validation/diceEvent";

/** Prisma error code raised when a record to update/delete does not exist. */
const RECORD_NOT_FOUND = "P2025";

/** A campaign arc with how many log entries it holds. */
export type CampaignArcRow = {
  id: string;
  number: number;
  name: string | null;
  eventCount: number;
};

/** Result of an arc mutation. `error` holds an i18n key on failure. */
export type CampaignArcMutationResult =
  | { ok: true; arcId: string }
  | { ok: false; error: string };

/**
 * Lists a campaign's arcs in order, with their entry counts.
 *
 * @param {string} campaignId - Id of the campaign.
 * @returns {Promise<CampaignArcRow[]>} The arcs, lowest number first.
 */
export async function listCampaignArcs(campaignId: string): Promise<CampaignArcRow[]> {
  const arcs = await prisma.campaignArc.findMany({
    where: { campaignId },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      name: true,
      _count: { select: { diceEvents: true } },
    },
  });
  return arcs.map((arc) => ({
    id: arc.id,
    number: arc.number,
    name: arc.name,
    eventCount: arc._count.diceEvents,
  }));
}

/**
 * Creates the campaign's next arc: number = highest existing + 1. The campaign
 * row is locked for the transaction so two DMs adding at once cannot pick the
 * same number.
 *
 * @param {string} campaignId - Id of the campaign.
 * @param {CampaignArcInput} input - Validated payload (optional name).
 * @returns {Promise<CampaignArcMutationResult>} The new arc id, or an error key.
 */
export async function createCampaignArc(
  campaignId: string,
  input: CampaignArcInput,
): Promise<CampaignArcMutationResult> {
  try {
    const arc = await prisma.$transaction(async (tx) => {
      await lockRow(tx, "campaign", campaignId);
      const last = await tx.campaignArc.aggregate({
        where: { campaignId },
        _max: { number: true },
      });
      return tx.campaignArc.create({
        data: { campaignId, number: (last._max.number ?? 0) + 1, name: input.name ?? null },
        select: { id: true },
      });
    });
    return { ok: true, arcId: arc.id };
  } catch (error) {
    console.error("[ARCS/CREATE] Failed to create arc:", error);
    return { ok: false, error: "arcs.errors.unknown" };
  }
}

/**
 * Renames an arc. The arc must belong to the given campaign, so a DM cannot
 * touch another campaign's arc by guessing its id.
 *
 * @param {string} campaignId - Campaign the arc must belong to.
 * @param {string} arcId - Id of the arc.
 * @param {CampaignArcInput} input - Validated payload (optional name).
 * @returns {Promise<CampaignArcMutationResult>} The arc id, or an error key.
 */
export async function updateCampaignArc(
  campaignId: string,
  arcId: string,
  input: CampaignArcInput,
): Promise<CampaignArcMutationResult> {
  try {
    const { count } = await prisma.campaignArc.updateMany({
      where: { id: arcId, campaignId },
      data: { name: input.name ?? null },
    });
    if (count === 0) {
      return { ok: false, error: "arcs.errors.notFound" };
    }
    return { ok: true, arcId };
  } catch (error) {
    console.error("[ARCS/UPDATE] Failed to update arc:", error);
    return { ok: false, error: "arcs.errors.unknown" };
  }
}

/**
 * Deletes an arc. Its log entries are kept and simply lose the arc (the
 * foreign key is `SetNull`); numbers of the other arcs are not renumbered.
 *
 * @param {string} campaignId - Campaign the arc must belong to.
 * @param {string} arcId - Id of the arc.
 * @returns {Promise<CampaignArcMutationResult>} The arc id, or an error key.
 */
export async function deleteCampaignArc(
  campaignId: string,
  arcId: string,
): Promise<CampaignArcMutationResult> {
  try {
    const { count } = await prisma.campaignArc.deleteMany({
      where: { id: arcId, campaignId },
    });
    if (count === 0) {
      return { ok: false, error: "arcs.errors.notFound" };
    }
    return { ok: true, arcId };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return { ok: false, error: "arcs.errors.notFound" };
    }
    console.error("[ARCS/DELETE] Failed to delete arc:", error);
    return { ok: false, error: "arcs.errors.unknown" };
  }
}
