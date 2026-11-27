import { Prisma } from "@/generated/prisma/client";
import { CampaignRole } from "@/generated/prisma/enums";
import { nextFreeSlot } from "@/lib/campaignColor";
import { prisma } from "@/lib/prisma";
import { todayIso } from "@/lib/today";
import { toUtcDate } from "@/lib/date";
import type { CampaignInput } from "@/lib/validation/campaign";

/** Prisma error code raised when a record to update/delete does not exist. */
const RECORD_NOT_FOUND = "P2025";

/** A campaign as seen by a specific member, including that member's role. */
export type CampaignWithRole = {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  /** Palette slot of the campaign's colour (see `campaignColor.ts`). */
  colorSlot: number;
  /** The role system the campaign plays, or `null` while none is set. */
  systemId: string | null;
  /** Whether the critical/fumble log shows the DMs' own entries (off by default). */
  showDmRolls: boolean;
  role: CampaignRole;
  /** When a DM archived the campaign, or `null` while it is active. */
  archivedAt: Date | null;
};

/** A role system a campaign can be assigned. */
export type SystemOption = { id: string; name: string };

/** Result of a campaign mutation. `error` holds an i18n key on failure. */
export type CampaignMutationResult =
  | { ok: true; campaignId: string }
  | { ok: false; error: string };

/** Shape returned by Prisma when selecting a membership with its campaign. */
type MembershipWithCampaign = {
  role: CampaignRole;
  campaign: {
    id: string;
    name: string;
    tag: string;
    description: string | null;
    archivedAt: Date | null;
    colorSlot: number;
    systemId: string | null;
    showDmRolls: boolean;
  };
};

/**
 * Flattens a `CampaignPlayer` row (joined with its campaign) into the
 * member-facing `CampaignWithRole` shape.
 *
 * @param {MembershipWithCampaign} membership - Joined membership + campaign.
 * @returns {CampaignWithRole} The flattened campaign with the member's role.
 */
function toCampaignWithRole(membership: MembershipWithCampaign): CampaignWithRole {
  return {
    id: membership.campaign.id,
    name: membership.campaign.name,
    tag: membership.campaign.tag,
    description: membership.campaign.description,
    colorSlot: membership.campaign.colorSlot,
    systemId: membership.campaign.systemId,
    showDmRolls: membership.campaign.showDmRolls,
    role: membership.role,
    archivedAt: membership.campaign.archivedAt,
  };
}

/**
 * Lists the campaigns the user belongs to (as DM or player), each annotated
 * with the user's role, sorted by campaign name. New users get an empty list.
 *
 * @param {string} userId - Id of the user whose campaigns are listed.
 * @returns {Promise<CampaignWithRole[]>} The user's campaigns with their role.
 */
export async function listCampaignsForUser(
  userId: string,
): Promise<CampaignWithRole[]> {
  const memberships = await prisma.campaignPlayer.findMany({
    where: { userId },
    select: {
      role: true,
      campaign: {
        select: {
          id: true,
          name: true,
          tag: true,
          description: true,
          archivedAt: true,
          colorSlot: true,
          systemId: true,
          showDmRolls: true,
        },
      },
    },
    orderBy: { campaign: { name: "asc" } },
  });

  return memberships.map(toCampaignWithRole);
}

/**
 * Fetches a single campaign scoped to the user's membership. Returns `null`
 * when the user is not a member or the campaign does not exist, so callers can
 * respond 404 without leaking a campaign's existence to non-members.
 *
 * @param {string} campaignId - Id of the campaign to fetch.
 * @param {string} userId - Id of the requesting user.
 * @returns {Promise<CampaignWithRole | null>} The campaign, or `null`.
 */
export async function getCampaignForUser(
  campaignId: string,
  userId: string,
): Promise<CampaignWithRole | null> {
  const membership = await prisma.campaignPlayer.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
    select: {
      role: true,
      campaign: {
        select: {
          id: true,
          name: true,
          tag: true,
          description: true,
          archivedAt: true,
          colorSlot: true,
          systemId: true,
          showDmRolls: true,
        },
      },
    },
  });

  return membership ? toCampaignWithRole(membership) : null;
}

/**
 * Lists the role systems a campaign can be assigned: every active one, plus the
 * campaign's current one even if it has since been deactivated (so editing does
 * not silently drop it from the select).
 *
 * @param {string | null} [currentSystemId] - The system the campaign already has.
 * @returns {Promise<SystemOption[]>} The systems, by name.
 */
export async function listSystemOptions(
  currentSystemId: string | null = null,
): Promise<SystemOption[]> {
  return prisma.roleSystem.findMany({
    where: { OR: [{ active: true }, ...(currentSystemId ? [{ id: currentSystemId }] : [])] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Lists the colour slots in use, each with the tag of the campaign that holds
 * it, so the edit form can disable the taken swatches and say who has them.
 *
 * @param {string} [excludeCampaignId] - A campaign to leave out (the one being edited).
 * @returns {Promise<Record<number, string>>} Tag of the holder, by slot.
 */
export async function listUsedColorSlots(
  excludeCampaignId?: string,
): Promise<Record<number, string>> {
  const campaigns = await prisma.campaign.findMany({
    where: excludeCampaignId ? { id: { not: excludeCampaignId } } : undefined,
    select: { colorSlot: true, tag: true },
  });
  return Object.fromEntries(campaigns.map((campaign) => [campaign.colorSlot, campaign.tag]));
}

/**
 * Creates a campaign and, atomically in the same write, the creator's DM
 * membership. `createdById` records ownership for audit; management rights come
 * from the DM membership row (CLAUDE.md §4). The campaign gets the first colour
 * slot no other campaign uses.
 *
 * @param {string} userId - Id of the creating user (becomes DM).
 * @param {CampaignInput} input - Already Zod-validated campaign payload.
 * @returns {Promise<CampaignMutationResult>} Success with the new id, or an
 *   error key (`campaigns.errors.systemInvalid` / `unknown`).
 */
export async function createCampaign(
  userId: string,
  input: CampaignInput,
): Promise<CampaignMutationResult> {
  try {
    if (input.systemId && !(await prisma.roleSystem.findFirst({ where: { id: input.systemId, active: true }, select: { id: true } }))) {
      return { ok: false, error: "campaigns.errors.systemInvalid" };
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const taken = await tx.campaign.findMany({ select: { colorSlot: true } });
      return tx.campaign.create({
        data: {
          name: input.name,
          tag: input.tag,
          description: input.description ?? null,
          colorSlot: nextFreeSlot(taken.map((row) => row.colorSlot)),
          systemId: input.systemId ?? null,
          showDmRolls: input.showDmRolls ?? false,
          createdById: userId,
          players: { create: { userId, role: CampaignRole.DM } },
        },
        select: { id: true },
      });
    });

    return { ok: true, campaignId: campaign.id };
  } catch (error) {
    console.error("[CAMPAIGNS/CREATE] Failed to create campaign:", error);
    return { ok: false, error: "campaigns.errors.unknown" };
  }
}

/**
 * Updates a campaign's editable fields (full replace). A missing record (e.g.
 * deleted between the authorization check and this write) surfaces as a
 * friendly i18n error key rather than throwing.
 *
 * @param {string} campaignId - Id of the campaign to update.
 * When the payload carries a `colorSlot` it must not be held by another
 * campaign; omitting it leaves the colour as it is. Likewise `systemId`: omitted
 * leaves the system alone, a different one must exist and be active, and the
 * system cannot change at all once the campaign has critical/fumble entries
 * (they point at the old system's catalogue).
 *
 * @param {CampaignInput} input - Already Zod-validated campaign payload.
 * @returns {Promise<CampaignMutationResult>} Success, or an error key
 *   (`campaigns.errors.notFound` / `colorTaken` / `systemInvalid` /
 *   `systemLocked` / `unknown`).
 */
export async function updateCampaign(
  campaignId: string,
  input: CampaignInput,
): Promise<CampaignMutationResult> {
  try {
    if (input.colorSlot !== undefined) {
      const holder = await prisma.campaign.findFirst({
        where: { colorSlot: input.colorSlot, id: { not: campaignId } },
        select: { id: true },
      });
      if (holder) {
        return { ok: false, error: "campaigns.errors.colorTaken" };
      }
    }

    if (input.systemId !== undefined) {
      const current = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { systemId: true },
      });
      if (!current) {
        return { ok: false, error: "campaigns.errors.notFound" };
      }
      if (current.systemId !== input.systemId) {
        if (
          input.systemId &&
          !(await prisma.roleSystem.findFirst({ where: { id: input.systemId, active: true }, select: { id: true } }))
        ) {
          return { ok: false, error: "campaigns.errors.systemInvalid" };
        }
        if ((await prisma.diceEvent.count({ where: { campaignId } })) > 0) {
          return { ok: false, error: "campaigns.errors.systemLocked" };
        }
      }
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        name: input.name,
        tag: input.tag,
        description: input.description ?? null,
        ...(input.colorSlot !== undefined ? { colorSlot: input.colorSlot } : {}),
        ...(input.systemId !== undefined ? { systemId: input.systemId } : {}),
        ...(input.showDmRolls !== undefined ? { showDmRolls: input.showDmRolls } : {}),
      },
      select: { id: true },
    });

    return { ok: true, campaignId };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return { ok: false, error: "campaigns.errors.notFound" };
    }

    console.error("[CAMPAIGNS/UPDATE] Failed to update campaign:", error);
    return { ok: false, error: "campaigns.errors.unknown" };
  }
}

/**
 * Deletes a campaign. Its `CampaignPlayer` rows and its sessions go with it
 * through the cascade on the foreign keys, and so do those sessions' entries in
 * everyone's calendar feed, which is generated from the database on each
 * request. A missing record surfaces as a friendly i18n error key.
 *
 * @param {string} campaignId - Id of the campaign to delete.
 * @returns {Promise<CampaignMutationResult>} Success, or an error key
 *   (`campaigns.errors.notFound` / `campaigns.errors.unknown`).
 */
export async function deleteCampaign(
  campaignId: string,
): Promise<CampaignMutationResult> {
  try {
    await prisma.campaign.delete({
      where: { id: campaignId },
      select: { id: true },
    });

    return { ok: true, campaignId };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return { ok: false, error: "campaigns.errors.notFound" };
    }

    console.error("[CAMPAIGNS/DELETE] Failed to delete campaign:", error);
    return { ok: false, error: "campaigns.errors.unknown" };
  }
}

/**
 * Archives or unarchives a campaign. Archiving is refused while the campaign
 * still has active sessions dated today or later (a DM cancels them first);
 * both directions are refused when the campaign is already in the target state,
 * so a double tap surfaces a clear message instead of silently succeeding.
 * Trusts the caller already checked the DM role.
 *
 * @param {string} campaignId - Id of the campaign.
 * @param {boolean} archive - `true` to archive, `false` to unarchive.
 * @returns {Promise<CampaignMutationResult>} Success, or an error key
 *   (`notFound` / `alreadyArchived` / `notArchived` / `hasUpcomingSessions` / `unknown`).
 */
export async function setCampaignArchived(
  campaignId: string,
  archive: boolean,
): Promise<CampaignMutationResult> {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { archivedAt: true },
    });
    if (!campaign) {
      return { ok: false, error: "campaigns.errors.notFound" };
    }
    if (archive && campaign.archivedAt !== null) {
      return { ok: false, error: "campaigns.errors.alreadyArchived" };
    }
    if (!archive && campaign.archivedAt === null) {
      return { ok: false, error: "campaigns.errors.notArchived" };
    }

    if (archive) {
      const upcoming = await prisma.confirmedSession.count({
        where: {
          campaignId,
          cancelledAt: null,
          date: { gte: toUtcDate(todayIso()) },
        },
      });
      if (upcoming > 0) {
        return { ok: false, error: "campaigns.errors.hasUpcomingSessions" };
      }
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { archivedAt: archive ? new Date() : null },
      select: { id: true },
    });

    return { ok: true, campaignId };
  } catch (error) {
    console.error("[CAMPAIGNS/ARCHIVE] Failed to change archive state:", error);
    return { ok: false, error: "campaigns.errors.unknown" };
  }
}
