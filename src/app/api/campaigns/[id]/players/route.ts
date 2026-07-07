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

/**
 * Resolves the session and DM authorization for a campaign-players mutation.
 * Returns the target campaign id on success, or a ready-to-send error response
 * mirroring the guard ladder of `PUT/DELETE /api/campaigns/[id]`: 401 when
 * unauthenticated, 404 for non-members (hides existence), 403 for players.
 *
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<{ campaignId: string } | { response: NextResponse }>}
 */
async function authorizeDm(
  { params }: RouteContext,
): Promise<{ campaignId: string } | { response: NextResponse }> {
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
  if (role !== CampaignRole.DM) {
    return {
      response: NextResponse.json(
        { error: "campaigns.errors.forbidden" },
        { status: 403 },
      ),
    };
  }

  return { campaignId: id };
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
  const authorized = await authorizeDm(context);
  if ("response" in authorized) {
    return authorized.response;
  }

  const parsed = await parseUserId(request);
  if ("response" in parsed) {
    return parsed.response;
  }

  const result = await addPlayerToCampaign(
    authorized.campaignId,
    parsed.userId,
  );
  return respondToMutation(
    result,
    { campaignId: authorized.campaignId, userId: parsed.userId },
    201,
  );
}

/**
 * DELETE /api/campaigns/[id]/players — removes a user from the campaign.
 * Restricted to a DM of the campaign; removing the last DM is rejected (400).
 * Non-member → 404, player → 403, malformed body → 400.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, 403, 404, or 500.
 */
export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const authorized = await authorizeDm(context);
  if ("response" in authorized) {
    return authorized.response;
  }

  const parsed = await parseUserId(request);
  if ("response" in parsed) {
    return parsed.response;
  }

  const result = await removePlayerFromCampaign(
    authorized.campaignId,
    parsed.userId,
  );
  return respondToMutation(
    result,
    { campaignId: authorized.campaignId, userId: parsed.userId },
    200,
  );
}
