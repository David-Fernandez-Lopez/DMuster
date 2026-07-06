import { Prisma } from "@/generated/prisma/client";
import { CampaignRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { CampaignInput } from "@/lib/validation/campaign";

/** Prisma error code raised when a record to update/delete does not exist. */
const RECORD_NOT_FOUND = "P2025";

/** A campaign as seen by a specific member, including that member's role. */
export type CampaignWithRole = {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  role: CampaignRole;
};

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
    role: membership.role,
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
        select: { id: true, name: true, tag: true, description: true },
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
        select: { id: true, name: true, tag: true, description: true },
      },
    },
  });

  return membership ? toCampaignWithRole(membership) : null;
}

/**
 * Creates a campaign and, atomically in the same write, the creator's DM
 * membership. `createdById` records ownership for audit; management rights come
 * from the DM membership row (CLAUDE.md §4).
 *
 * @param {string} userId - Id of the creating user (becomes DM).
 * @param {CampaignInput} input - Already Zod-validated campaign payload.
 * @returns {Promise<CampaignMutationResult>} Success with the new id, or an
 *   error key (`campaigns.errors.unknown`).
 */
export async function createCampaign(
  userId: string,
  input: CampaignInput,
): Promise<CampaignMutationResult> {
  try {
    const campaign = await prisma.campaign.create({
      data: {
        name: input.name,
        tag: input.tag,
        description: input.description ?? null,
        createdById: userId,
        players: { create: { userId, role: CampaignRole.DM } },
      },
      select: { id: true },
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
 * @param {CampaignInput} input - Already Zod-validated campaign payload.
 * @returns {Promise<CampaignMutationResult>} Success, or an error key
 *   (`campaigns.errors.notFound` / `campaigns.errors.unknown`).
 */
export async function updateCampaign(
  campaignId: string,
  input: CampaignInput,
): Promise<CampaignMutationResult> {
  try {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        name: input.name,
        tag: input.tag,
        description: input.description ?? null,
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
 * Deletes a campaign. Its `CampaignPlayer` rows are removed by the cascade on
 * the foreign key. A missing record surfaces as a friendly i18n error key.
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
