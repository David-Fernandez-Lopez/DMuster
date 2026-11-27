import { NextResponse } from "next/server";
import { z } from "zod";

import { CampaignRole } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { getCampaignRole } from "@/lib/authz";
import { createCampaignArc, listCampaignArcs } from "@/lib/campaignArcService";
import { statusForDiceError } from "@/lib/diceEventHttp";
import { firstFieldErrors } from "@/lib/validation/auth";
import { campaignArcSchema } from "@/lib/validation/diceEvent";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/campaigns/[id]/arcs — the campaign's arcs, in order. Any member may
 * read them (the log form needs them); non-members get 404.
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 404, or 500.
 */
export async function GET(_request: Request, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "arcs.errors.unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if ((await getCampaignRole(session.user.id, id)) === null) {
    return NextResponse.json({ error: "arcs.errors.notFound" }, { status: 404 });
  }

  try {
    return NextResponse.json({ data: await listCampaignArcs(id) });
  } catch (error) {
    console.error("[ARCS/LIST] Failed to list arcs:", error);
    return NextResponse.json({ error: "arcs.errors.unknown" }, { status: 500 });
  }
}

/**
 * POST /api/campaigns/[id]/arcs — adds the campaign's next arc. DM only:
 * non-member → 404, player → 403.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 201, 400, 401, 403, 404, or 500.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "arcs.errors.unauthorized" }, { status: 401 });
  }

  const { id } = await params;
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

  const result = await createCampaignArc(id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForDiceError(result.error) });
  }
  return NextResponse.json({ data: { id: result.arcId } }, { status: 201 });
}
