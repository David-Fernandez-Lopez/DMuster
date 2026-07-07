import { Prisma } from "@/generated/prisma/client";
import { CampaignRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/** Prisma error code raised when a record to update/delete does not exist. */
const RECORD_NOT_FOUND = "P2025";

/** Prisma error code raised on a unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

/** Prisma error code raised on a foreign-key-constraint violation. */
const FOREIGN_KEY_VIOLATION = "P2003";

/** A campaign member: the user's identity plus their role in that campaign. */
export type CampaignMember = {
  userId: string;
  name: string;
  role: CampaignRole;
};

/** A registered user eligible to be added to a campaign. */
export type AssignableUser = {
  id: string;
  name: string;
};

/** Result of a membership mutation. `error` holds an i18n key on failure. */
export type CampaignPlayerMutationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Lists the members of a campaign with their per-campaign role, ordered by
 * name (the design shows members alphabetically). Used by the DM management
 * page to render the current roster.
 *
 * @param {string} campaignId - Id of the campaign whose members are listed.
 * @returns {Promise<CampaignMember[]>} The campaign's members.
 */
export async function listCampaignMembers(
  campaignId: string,
): Promise<CampaignMember[]> {
  const memberships = await prisma.campaignPlayer.findMany({
    where: { campaignId },
    select: { role: true, user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return memberships.map((membership) => ({
    userId: membership.user.id,
    name: membership.user.name,
    role: membership.role,
  }));
}

/**
 * Lists registered users who are not yet members of the campaign, so the DM's
 * picker only offers users that can actually be added, ordered by name.
 *
 * @param {string} campaignId - Id of the campaign to exclude members of.
 * @returns {Promise<AssignableUser[]>} Users not in the campaign.
 */
export async function listAssignableUsers(
  campaignId: string,
): Promise<AssignableUser[]> {
  const users = await prisma.user.findMany({
    where: { campaigns: { none: { campaignId } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return users;
}

/**
 * Adds a user to a campaign as a player. Duplicate membership (composite PK)
 * and an unknown user (foreign key) surface as friendly i18n error keys rather
 * than throwing. The role is always `PLAYER`; promoting to DM is out of scope.
 *
 * @param {string} campaignId - Id of the campaign to add the user to.
 * @param {string} userId - Id of the user being added.
 * @returns {Promise<CampaignPlayerMutationResult>} Success, or an error key.
 */
export async function addPlayerToCampaign(
  campaignId: string,
  userId: string,
): Promise<CampaignPlayerMutationResult> {
  try {
    await prisma.campaignPlayer.create({
      data: { campaignId, userId, role: CampaignRole.PLAYER },
      select: { campaignId: true },
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === UNIQUE_VIOLATION) {
        return { ok: false, error: "campaigns.players.errors.alreadyMember" };
      }
      if (error.code === FOREIGN_KEY_VIOLATION) {
        return { ok: false, error: "campaigns.players.errors.userNotFound" };
      }
    }

    console.error("[CAMPAIGN_PLAYERS/ADD] Failed to add player:", error);
    return { ok: false, error: "campaigns.errors.unknown" };
  }
}

/**
 * Removes a user from a campaign. Refuses to remove the campaign's last DM,
 * which would leave it unmanageable (there is no global admin to recover it).
 * A user who is not a member surfaces as a friendly i18n error key.
 *
 * @param {string} campaignId - Id of the campaign to remove the user from.
 * @param {string} userId - Id of the user being removed.
 * @returns {Promise<CampaignPlayerMutationResult>} Success, or an error key
 *   (`notMember` / `lastDm` / `campaigns.errors.unknown`).
 */
export async function removePlayerFromCampaign(
  campaignId: string,
  userId: string,
): Promise<CampaignPlayerMutationResult> {
  try {
    const membership = await prisma.campaignPlayer.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
      select: { role: true },
    });

    if (!membership) {
      return { ok: false, error: "campaigns.players.errors.notMember" };
    }

    if (membership.role === CampaignRole.DM) {
      const dmCount = await prisma.campaignPlayer.count({
        where: { campaignId, role: CampaignRole.DM },
      });
      if (dmCount <= 1) {
        return { ok: false, error: "campaigns.players.errors.lastDm" };
      }
    }

    await prisma.campaignPlayer.delete({
      where: { campaignId_userId: { campaignId, userId } },
      select: { campaignId: true },
    });

    return { ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return { ok: false, error: "campaigns.players.errors.notMember" };
    }

    console.error("[CAMPAIGN_PLAYERS/REMOVE] Failed to remove player:", error);
    return { ok: false, error: "campaigns.errors.unknown" };
  }
}
