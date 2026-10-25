import { NextResponse } from "next/server";
import { z } from "zod";

import { CampaignRole } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { getCampaignRole } from "@/lib/authz";
import {
  resetCampaignRequirements,
  setCampaignRequirements,
  type CampaignRequirementsMutationResult,
} from "@/lib/campaignRequirementsService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { campaignRequirementsSchema } from "@/lib/validation/campaign";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Authenticates the caller and checks they are a DM of the campaign — the
 * guard ladder shared by both handlers: no session → 401, not a member (or an
 * unknown id) → 404 so existence is not leaked, a member who is only a player
 * → 403.
 *
 * @param {string} campaignId - The campaign being configured.
 * @returns {Promise<NextResponse | null>} The refusal to return, or `null`
 *   when the caller may proceed.
 */
async function guardCampaignDm(campaignId: string): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "campaigns.errors.unauthorized" },
      { status: 401 },
    );
  }

  const role = await getCampaignRole(session.user.id, campaignId);
  if (role === null) {
    return NextResponse.json(
      { error: "campaigns.errors.notFound" },
      { status: 404 },
    );
  }
  if (role !== CampaignRole.DM) {
    return NextResponse.json(
      { error: "campaigns.errors.forbidden" },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Maps a requirements mutation result to its HTTP response: a missing campaign
 * is 404, an unexpected failure 500, any business refusal (`notPlayer`,
 * `minTooHigh`, `empty`) 400.
 *
 * @param {string} campaignId - The campaign that was configured.
 * @param {CampaignRequirementsMutationResult} result - The service outcome.
 * @returns {NextResponse} 200 with the campaign id, or the error response.
 */
function respondToMutation(
  campaignId: string,
  result: CampaignRequirementsMutationResult,
): NextResponse {
  if (result.ok) {
    return NextResponse.json({ data: { id: campaignId } });
  }

  const status =
    result.error === "campaigns.errors.notFound"
      ? 404
      : result.error === "campaigns.errors.unknown"
        ? 500
        : 400;
  return NextResponse.json({ error: result.error }, { status });
}

/**
 * PUT /api/campaigns/[id]/requirements — saves the campaign's requirements for
 * its next session (roadmap #25): the required players and an optional minimum
 * number of players. Restricted to a DM of the campaign; authorization runs
 * before body validation.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, 403, 404, or 500.
 */
export async function PUT(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { id } = await params;

  const refusal = await guardCampaignDm(id);
  if (refusal) {
    return refusal;
  }

  const body = await request.json().catch(() => null);
  const parsed = campaignRequirementsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "campaigns.requirements.errors.validation",
        fieldErrors: firstFieldErrors(z.flattenError(parsed.error).fieldErrors),
      },
      { status: 400 },
    );
  }

  return respondToMutation(id, await setCampaignRequirements(id, parsed.data));
}

/**
 * DELETE /api/campaigns/[id]/requirements — puts the campaign back on the
 * default rule (every member required, no minimum) before its requirements
 * would expire on their own. Restricted to a DM of the campaign.
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 403, 404, or 500.
 */
export async function DELETE(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { id } = await params;

  const refusal = await guardCampaignDm(id);
  if (refusal) {
    return refusal;
  }

  return respondToMutation(id, await resetCampaignRequirements(id));
}
