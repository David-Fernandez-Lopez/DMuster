import { NextResponse } from "next/server";

import { CampaignRole } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { getCampaignRole } from "@/lib/authz";
import { setCampaignArchived } from "@/lib/campaignService";

type RouteContext = { params: Promise<{ id: string }> };

/** Maps a service error key to its HTTP status. */
const ERROR_STATUS: Record<string, number> = {
  "campaigns.errors.notFound": 404,
  "campaigns.errors.alreadyArchived": 409,
  "campaigns.errors.notArchived": 409,
  "campaigns.errors.hasUpcomingSessions": 409,
};

/**
 * Shared handler for archiving (`POST`) and unarchiving (`DELETE`). Ladder:
 * 401 → 404 (unknown campaign or non-member) → 403 (member, not DM) → 409
 * (already in that state, or upcoming sessions still active) → 500.
 *
 * @param {RouteContext} context - Route context with the async `params`.
 * @param {boolean} archive - `true` to archive, `false` to unarchive.
 * @returns {Promise<NextResponse>} The JSON response.
 */
async function handle(
  { params }: RouteContext,
  archive: boolean,
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

  const result = await setCampaignArchived(id, archive);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: ERROR_STATUS[result.error] ?? 500 },
    );
  }

  return NextResponse.json({ data: { id: result.campaignId } });
}

/**
 * POST /api/campaigns/[id]/archive — archives the campaign (DM only).
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 403, 404, 409, or 500.
 */
export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return handle(context, true);
}

/**
 * DELETE /api/campaigns/[id]/archive — unarchives the campaign (DM only).
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 403, 404, 409, or 500.
 */
export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return handle(context, false);
}
