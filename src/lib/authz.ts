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

/**
 * Reports whether the user is a DM of at least one campaign. This is the signal
 * that gates holiday management (CLAUDE.md §4): there is no global admin role,
 * so anyone holding the DM role anywhere may add/remove the extra weekday
 * holidays. Reused by the `/api/holidays` guard and the `/holidays` page.
 *
 * Denies outright on a missing id instead of querying. Prisma reads `undefined`
 * in a `where` clause as "no filter at all", so the count would fall back to
 * every DM membership in the instance and return `true` — an authorization
 * check answering "yes" to a caller who supplied no identity. The type says
 * that cannot happen; this is here for the runtime where it can, since every
 * caller reads the id off a session object.
 *
 * @param {string} userId - Id of the user to check.
 * @returns {Promise<boolean>} True when the user is DM of one or more campaigns.
 */
export async function isDmOfAnyCampaign(userId: string): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const dmCount = await prisma.campaignPlayer.count({
    where: { userId, role: CampaignRole.DM },
  });

  return dmCount > 0;
}
