import { NextResponse } from "next/server";
import { z } from "zod";

import { CampaignRole } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { getCampaignRole } from "@/lib/authz";
import {
  addPlayerToCampaign,
  type CampaignPlayerMutationResult,
  removePlayerFromCampaign,
} from "@/lib/campaignPlayerService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { campaignPlayerSchema } from "@/lib/validation/campaign";

type RouteContext = { params: Promise<{ id: string }> };

/** Error keys that mean the request was malformed rather than not-found. */
const BAD_REQUEST_ERRORS = new Set([
  "campaigns.players.errors.alreadyMember",
  "campaigns.players.errors.lastDm",
]);

/**
 * Maps a failed membership mutation to its HTTP status: conflicting requests
 * (already a member / last DM) are 400, missing targets (unknown user / not a
 * member) are 404, and anything else is treated as a server error (500).
 *
 * @param {string} error - The i18n error key returned by the service.
 * @returns {number} The HTTP status to respond with.
 */
function mutationErrorStatus(error: string): number {
  if (BAD_REQUEST_ERRORS.has(error)) {
    return 400;
  }
  if (error === "campaigns.errors.unknown") {
    return 500;
  }
  return 404;
}

/** The acting user's standing in the campaign a mutation targets. */
type Membership = { campaignId: string; actorId: string; role: CampaignRole };

/** Ready-to-send 403 for a member who lacks the rights for what they asked. */
const FORBIDDEN = NextResponse.json(
  { error: "campaigns.errors.forbidden" },
  { status: 403 },
);

/**
 * Resolves the acting user's membership of the campaign a mutation targets:
 * 401 when unauthenticated, 404 when they are not a member at all (which hides
 * the campaign's existence from strangers), otherwise the role they hold.
 *
 * Stops at membership rather than demanding DM, because what counts as
 * authorized depends on who the request targets — see `DELETE`.
 *
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<Membership | { response: NextResponse }>}
 */
async function resolveMembership(
  { params }: RouteContext,
): Promise<Membership | { response: NextResponse }> {
  const session = await auth();
  if (!session?.user) {
    return {
      response: NextResponse.json(
        { error: "campaigns.errors.unauthorized" },
        { status: 401 },
      ),
    };
  }

  const { id } = await params;

  const role = await getCampaignRole(session.user.id, id);
  if (role === null) {
    return {
      response: NextResponse.json(
        { error: "campaigns.errors.notFound" },
        { status: 404 },
      ),
    };
  }

  return { campaignId: id, actorId: session.user.id, role };
}

/**
 * Parses and Zod-validates the membership body (`{ userId }`), returning either
 * the target user id or a ready-to-send 400 response.
 *
 * @param {Request} request - The incoming request carrying the JSON body.
 * @returns {Promise<{ userId: string } | { response: NextResponse }>}
 */
async function parseUserId(
  request: Request,
): Promise<{ userId: string } | { response: NextResponse }> {
  const body = await request.json().catch(() => null);
  const parsed = campaignPlayerSchema.safeParse(body);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        {
          error: "campaigns.players.errors.validation",
          fieldErrors: firstFieldErrors(
            z.flattenError(parsed.error).fieldErrors,
          ),
        },
        { status: 400 },
      ),
    };
  }

  return { userId: parsed.data.userId };
}

/**
 * Sends a membership mutation result as an HTTP response: 200 `{ data }` on
 * success, or the mapped error status with the i18n error key on failure.
 *
 * @param {CampaignPlayerMutationResult} result - Outcome of the service call.
 * @param {object} success - The `data` payload to return on success.
 * @param {number} successStatus - The status to use on success (200 or 201).
 * @returns {NextResponse} The response to return from the handler.
 */
function respondToMutation(
  result: CampaignPlayerMutationResult,
  success: { campaignId: string; userId: string },
  successStatus: number,
): NextResponse {
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: mutationErrorStatus(result.error) },
    );
  }

  return NextResponse.json({ data: success }, { status: successStatus });
}

/**
 * POST /api/campaigns/[id]/players — adds a user to the campaign as a player.
 * Restricted to a DM of the campaign. Authorization runs before body
 * validation: non-member → 404, player → 403, malformed body → 400.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 201, 400, 401, 403, 404, or 500.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const membership = await resolveMembership(context);
  if ("response" in membership) {
    return membership.response;
  }
  if (membership.role !== CampaignRole.DM) {
    return FORBIDDEN;
  }

  const parsed = await parseUserId(request);
  if ("response" in parsed) {
    return parsed.response;
  }

  const result = await addPlayerToCampaign(
    membership.campaignId,
    parsed.userId,
  );
  return respondToMutation(
    result,
    { campaignId: membership.campaignId, userId: parsed.userId },
    201,
  );
}

/**
 * DELETE /api/campaigns/[id]/players — removes a user from the campaign.
 *
 * A DM may remove anyone; **anyone may remove themselves**. Leaving needs no
 * DM's permission because otherwise membership is a one-way door: a campaign
 * can add any registered user without asking, and until now only a DM of that
 * campaign could undo it. Someone added against their wishes had no way out —
 * and, because attending a session blocks that whole day for their other
 * campaigns, no way to stop it costing them elsewhere either.
 *
 * The last-DM guard still applies, and applies to leaving too: a campaign's
 * only DM cannot walk out and strand it with nobody able to manage it.
 *
 * Non-member → 404, player naming someone else → 403, malformed body → 400.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, 403, 404, or 500.
 */
export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const membership = await resolveMembership(context);
  if ("response" in membership) {
    return membership.response;
  }

  const parsed = await parseUserId(request);
  if ("response" in parsed) {
    return parsed.response;
  }

  // Whether DM rights are needed depends on the target, so this check has to
  // come after the body is read. Membership was already established above, so a
  // stranger is still turned away with a 404 before anything is parsed.
  const isSelf = parsed.userId === membership.actorId;
  if (!isSelf && membership.role !== CampaignRole.DM) {
    return FORBIDDEN;
  }

  const result = await removePlayerFromCampaign(
    membership.campaignId,
    parsed.userId,
  );
  return respondToMutation(
    result,
    { campaignId: membership.campaignId, userId: parsed.userId },
    200,
  );
}
