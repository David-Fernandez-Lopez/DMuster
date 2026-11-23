import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getCampaignRole } from "@/lib/authz";
import { createDiceEvent, listDiceEvents } from "@/lib/diceEventService";
import { statusForDiceError } from "@/lib/diceEventHttp";
import { firstFieldErrors } from "@/lib/validation/auth";
import { diceEventCreateSchema, diceEventFilterSchema } from "@/lib/validation/diceEvent";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/campaigns/[id]/dice-events — a page of the campaign's critical and
 * fumble log. Filters (`userId`, `kind`, `arcId`, `page`, `pageSize`) come from
 * the query string. Non-members get 404.
 *
 * @param {Request} request - The incoming request.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 404, or 500.
 */
export async function GET(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "diceEvents.errors.unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if ((await getCampaignRole(session.user.id, id)) === null) {
    return NextResponse.json({ error: "diceEvents.errors.notFound" }, { status: 404 });
  }

  const query = Object.fromEntries(new URL(request.url).searchParams);
  const filters = diceEventFilterSchema.parse({ ...query, campaignId: id });

  try {
    return NextResponse.json({ data: await listDiceEvents(session.user.id, filters) });
  } catch (error) {
    console.error("[DICE_EVENTS/LIST] Failed to list events:", error);
    return NextResponse.json({ error: "diceEvents.errors.unknown" }, { status: 500 });
  }
}

/**
 * POST /api/campaigns/[id]/dice-events — records a critical or fumble, stamped
 * with the current date and time by the server (a `date`/`time` in the body is
 * ignored). Any member of the campaign may record one for any member.
 * Non-member → 404.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 201, 400, 401, 404, or 500.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "diceEvents.errors.unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if ((await getCampaignRole(session.user.id, id)) === null) {
    return NextResponse.json({ error: "diceEvents.errors.notFound" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = diceEventCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "diceEvents.errors.validation",
        fieldErrors: firstFieldErrors(z.flattenError(parsed.error).fieldErrors),
      },
      { status: 400 },
    );
  }

  const result = await createDiceEvent(id, session.user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForDiceError(result.error) });
  }
  return NextResponse.json({ data: { id: result.eventId } }, { status: 201 });
}
