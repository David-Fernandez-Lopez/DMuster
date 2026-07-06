import { NextResponse } from "next/server";
import { z } from "zod";

import { CampaignRole } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { getCampaignRole } from "@/lib/authz";
import {
  deleteCampaign,
  getCampaignForUser,
  updateCampaign,
} from "@/lib/campaignService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { campaignSchema } from "@/lib/validation/campaign";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/campaigns/[id] — returns a campaign the session user belongs to.
 * Non-members (and unknown ids) get 404 to avoid leaking existence.
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 404, or 500.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "campaigns.errors.unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  try {
    const campaign = await getCampaignForUser(id, session.user.id);
    if (!campaign) {
      return NextResponse.json(
        { error: "campaigns.errors.notFound" },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: campaign });
  } catch (error) {
    console.error("[CAMPAIGNS/GET] Failed to fetch campaign:", error);
    return NextResponse.json(
      { error: "campaigns.errors.unknown" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/campaigns/[id] — full-replace update, restricted to a DM of the
 * campaign. Authorization runs before body validation: a non-member gets 404,
 * a member who is only a player gets 403, and only then is the body validated.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, 403, 404, or 500.
 */
export async function PUT(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "campaigns.errors.unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  const role = await getCampaignRole(session.user.id, id);
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

  const body = await request.json().catch(() => null);
  const parsed = campaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "campaigns.errors.validation",
        fieldErrors: firstFieldErrors(z.flattenError(parsed.error).fieldErrors),
      },
      { status: 400 },
    );
  }

  const result = await updateCampaign(id, parsed.data);
  if (!result.ok) {
    const status = result.error === "campaigns.errors.notFound" ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: { id: result.campaignId } });
}

/**
 * DELETE /api/campaigns/[id] — removes a campaign (cascading its memberships),
 * restricted to a DM of the campaign. Non-member → 404, player → 403.
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 403, 404, or 500.
 */
export async function DELETE(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "campaigns.errors.unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  const role = await getCampaignRole(session.user.id, id);
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

  const result = await deleteCampaign(id);
  if (!result.ok) {
    const status = result.error === "campaigns.errors.notFound" ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: { id: result.campaignId } });
}
