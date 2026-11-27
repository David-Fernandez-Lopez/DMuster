import { NextResponse } from "next/server";
import { z } from "zod";

import { CampaignRole } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { getCampaignRole } from "@/lib/authz";
import { deleteCampaignArc, updateCampaignArc } from "@/lib/campaignArcService";
import { statusForDiceError } from "@/lib/diceEventHttp";
import { firstFieldErrors } from "@/lib/validation/auth";
import { campaignArcSchema } from "@/lib/validation/diceEvent";

type RouteContext = { params: Promise<{ id: string; arcId: string }> };

/**
 * PUT /api/campaigns/[id]/arcs/[arcId] — renames an arc. DM only:
 * non-member → 404, player → 403.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, 403, 404, or 500.
 */
export async function PUT(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "arcs.errors.unauthorized" }, { status: 401 });
  }

  const { id, arcId } = await params;
  const role = await getCampaignRole(session.user.id, id);
  if (role === null) {
    return NextResponse.json({ error: "arcs.errors.notFound" }, { status: 404 });
  }
  if (role !== CampaignRole.DM) {
    return NextResponse.json({ error: "arcs.errors.forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = campaignArcSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "arcs.errors.validation",
        fieldErrors: firstFieldErrors(z.flattenError(parsed.error).fieldErrors),
      },
      { status: 400 },
    );
  }

  const result = await updateCampaignArc(id, arcId, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForDiceError(result.error) });
  }
  return NextResponse.json({ data: { id: result.arcId } });
}

/**
 * DELETE /api/campaigns/[id]/arcs/[arcId] — removes an arc; its log entries
 * stay, without an arc. DM only: non-member → 404, player → 403.
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 403, 404, or 500.
 */
export async function DELETE(_request: Request, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "arcs.errors.unauthorized" }, { status: 401 });
  }

  const { id, arcId } = await params;
  const role = await getCampaignRole(session.user.id, id);
  if (role === null) {
    return NextResponse.json({ error: "arcs.errors.notFound" }, { status: 404 });
  }
  if (role !== CampaignRole.DM) {
    return NextResponse.json({ error: "arcs.errors.forbidden" }, { status: 403 });
  }

  const result = await deleteCampaignArc(id, arcId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForDiceError(result.error) });
  }
  return NextResponse.json({ data: { id: result.arcId } });
}
