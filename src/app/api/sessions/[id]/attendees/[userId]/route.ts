import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { removeAttendee } from "@/lib/confirmedSessionService";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/** Error keys that mean the session or the attendee doesn't exist. */
const NOT_FOUND_ERRORS = new Set(["sessions.errors.notFound"]);

/** Error keys that mean the caller is a member but not a DM. */
const FORBIDDEN_ERRORS = new Set(["sessions.errors.forbidden"]);

/**
 * Maps a failed `removeAttendee` call to its HTTP status: a missing session
 * or attendee is 404, a non-DM actor (including the player removing
 * themselves) is 403, an unexpected failure is 500, and the remaining
 * business-rule keys (`lastAttendee`, `dmMustAttend`) are 400.
 *
 * @param {string} error - The i18n error key returned by the service.
 * @returns {number} The HTTP status to respond with.
 */
function attendeeMutationStatus(error: string): number {
  if (NOT_FOUND_ERRORS.has(error)) {
    return 404;
  }
  if (FORBIDDEN_ERRORS.has(error)) {
    return 403;
  }
  if (error === "sessions.errors.unknown") {
    return 500;
  }
  return 400;
}

/**
 * DELETE /api/sessions/[id]/attendees/[userId] — removes an attendee from an
 * active session (roadmap #22). DM-of-that-campaign only, even to remove
 * themselves — a player can never remove themselves. Ladder: 401 → 404
 * (missing session/attendee, or a non-member actor) → 403 (member, not DM) →
 * 400 (`lastAttendee` / `dmMustAttend`).
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, 403, or 404.
 */
export async function DELETE(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "sessions.errors.unauthorized" },
      { status: 401 },
    );
  }

  const { id, userId } = await params;

  const result = await removeAttendee(id, userId, session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: attendeeMutationStatus(result.error) },
    );
  }

  return NextResponse.json({ data: { userId: result.userId } });
}
