import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { revokeInvitation } from "@/lib/invitationService";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Maps a failed `revokeInvitation` call to its HTTP status: a missing
 * invitation is 404, a caller who is not its inviter is 403, an
 * already-accepted invitation cannot be revoked (400), and anything else is
 * 500.
 *
 * @param {string} error - The i18n error key returned by the service.
 * @returns {number} The HTTP status to respond with.
 */
function revokeErrorStatus(error: string): number {
  if (error === "invitations.errors.notFound") {
    return 404;
  }
  if (error === "invitations.errors.forbidden") {
    return 403;
  }
  if (error === "invitations.errors.alreadyAccepted") {
    return 400;
  }
  return 500;
}

/**
 * DELETE /api/invitations/[id] — revokes an invitation. Restricted to the
 * user who created it. Ladder: 401 → 404 (missing) → 403 (not the inviter) →
 * 400 (already accepted).
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, 403, 404, or 500.
 */
export async function DELETE(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "invitations.errors.unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  const result = await revokeInvitation(id, session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: revokeErrorStatus(result.error) },
    );
  }

  return NextResponse.json({ data: { id: result.id } });
}
