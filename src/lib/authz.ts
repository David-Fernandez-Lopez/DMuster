import { CampaignRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/**
 * Returns the role the user holds in the given campaign, or `null` when the
 * user is not a member (or the campaign does not exist). Management rights come
 * from holding the DM role in that campaign, never from `Campaign.createdById`
 * (audit only — CLAUDE.md §4).
 *
 * Callers map `null` to 404 (hide a campaign's existence from non-members) and
 * `PLAYER` to 403 on mutation attempts.
 *
 * @param {string} userId - Id of the user whose role is being resolved.
 * @param {string} campaignId - Id of the campaign to check membership in.
 * @returns {Promise<CampaignRole | null>} The member's role, or `null`.
 */
export async function getCampaignRole(
  userId: string,
  campaignId: string,
): Promise<CampaignRole | null> {
  const membership = await prisma.campaignPlayer.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
    select: { role: true },
  });

  return membership?.role ?? null;
}
