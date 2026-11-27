import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getCampaignRole } from "@/lib/authz";
import { statusForDiceError } from "@/lib/diceEventHttp";
import {
  deleteDiceEvent,
  getDiceEventCampaignId,
  updateDiceEvent,
} from "@/lib/diceEventService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { diceEventSchema } from "@/lib/validation/diceEvent";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Resolves the event's campaign and checks the caller belongs to it. A missing
 * event and a campaign the caller is not in look the same (404) so ids leak
 * nothing.
 *
 * @param {string} eventId - Id of the event.
 * @param {string} userId - Id of the signed-in user.
 * @returns {Promise<string | null>} The campaign id, or `null` when the caller may not see it.
 */
async function authorise(eventId: string, userId: string): Promise<string | null> {
  const campaignId = await getDiceEventCampaignId(eventId);
  if (!campaignId || (await getCampaignRole(userId, campaignId)) === null) {
    return null;
  }
  return campaignId;
}

/**
 * PUT /api/dice-events/[id] — full-replace update. Any member of the event's
 * campaign may edit any entry.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, 404, or 500.
 */
export async function PUT(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "diceEvents.errors.unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = await authorise(id, session.user.id);
  if (!campaignId) {
    return NextResponse.json({ error: "diceEvents.errors.notFound" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = diceEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "diceEvents.errors.validation",
        fieldErrors: firstFieldErrors(z.flattenError(parsed.error).fieldErrors),
      },
      { status: 400 },
    );
  }

  const result = await updateDiceEvent(id, campaignId, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForDiceError(result.error) });
  }
  return NextResponse.json({ data: { id: result.eventId } });
}

/**
 * DELETE /api/dice-events/[id] — removes an entry. Any member of the event's
 * campaign may delete any entry.
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 404, or 500.
 */
export async function DELETE(_request: Request, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "diceEvents.errors.unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await authorise(id, session.user.id))) {
    return NextResponse.json({ error: "diceEvents.errors.notFound" }, { status: 404 });
  }

  const result = await deleteDiceEvent(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForDiceError(result.error) });
  }
  return NextResponse.json({ data: { id: result.eventId } });
}
