import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createCampaign, listCampaignsForUser } from "@/lib/campaignService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { campaignSchema } from "@/lib/validation/campaign";

/**
 * GET /api/campaigns — lists the campaigns the session user is a member of,
 * each with the user's role. Returns 401 when unauthenticated (the proxy
 * excludes `/api`, so this handler guards itself). Responds `{ data }`.
 *
 * @returns {Promise<NextResponse>} 200 with the list, 401, or 500.
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "campaigns.errors.unauthorized" },
      { status: 401 },
    );
  }

  try {
    const campaigns = await listCampaignsForUser(session.user.id);
    return NextResponse.json({ data: campaigns });
  } catch (error) {
    console.error("[CAMPAIGNS/LIST] Failed to list campaigns:", error);
    return NextResponse.json(
      { error: "campaigns.errors.unknown" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/campaigns — creates a campaign; any authenticated user may create
 * one and becomes its DM. Validates the body with Zod (400 on failure) and
 * responds 201 `{ data: { id } }` on success.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @returns {Promise<NextResponse>} 201, 400, 401, or 500.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "campaigns.errors.unauthorized" },
      { status: 401 },
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

  const result = await createCampaign(session.user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: { id: result.campaignId } }, { status: 201 });
}
