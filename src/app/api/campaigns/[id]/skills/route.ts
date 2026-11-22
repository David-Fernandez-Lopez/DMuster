import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getCampaignRole } from "@/lib/authz";
import { listCampaignSkills } from "@/lib/diceEventService";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/campaigns/[id]/skills — skills already used in the campaign's log,
 * most used first, to suggest while typing. Non-members get 404.
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 404, or 500.
 */
export async function GET(_request: Request, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "diceEvents.errors.unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if ((await getCampaignRole(session.user.id, id)) === null) {
    return NextResponse.json({ error: "diceEvents.errors.notFound" }, { status: 404 });
  }

  try {
    return NextResponse.json({ data: await listCampaignSkills(id) });
  } catch (error) {
    console.error("[DICE_EVENTS/SKILLS] Failed to list skills:", error);
    return NextResponse.json({ error: "diceEvents.errors.unknown" }, { status: 500 });
  }
}
