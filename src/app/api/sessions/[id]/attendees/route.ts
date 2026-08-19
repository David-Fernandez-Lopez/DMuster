import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { addAttendee } from "@/lib/confirmedSessionService";
import { scheduleSyncSweep } from "@/lib/google/calendarSyncService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { addAttendeeSchema } from "@/lib/validation/confirmedSession";

type RouteContext = { params: Promise<{ id: string }> };

/** Error keys that mean the session doesn't exist (or the actor/target isn't a member). */
const NOT_FOUND_ERRORS = new Set(["sessions.errors.notFound"]);

/** Error keys that mean a non-DM tried to add someone other than themselves. */
const FORBIDDEN_ERRORS = new Set(["sessions.errors.forbidden"]);

/**
 * Maps a failed `addAttendee` call to its HTTP status: a missing/cancelled
 * session or a non-member is 404, a non-DM naming someone else is 403, an
 * unexpected failure is 500, and every other business-rule key
 * (`alreadyAttending`, `requiresYes`, `notMember`, `attendeeConflict`) is 400.
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
 * POST /api/sessions/[id]/attendees — adds an attendee to an active session
 * (roadmap #22). Body `{ userId? }`: omitted ⇒ self-join (any member of the
 * campaign who answered `YES` that day); present ⇒ the acting user must be a
 * DM of the session's campaign. Ladder: 401 → body validation (400) →
 * `addAttendee`'s own guards (404 / 403 / 400).
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 201, 400, 401, 403, 404, or 500.
 */
export async function POST(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "sessions.errors.unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = addAttendeeSchema.safeParse(body ?? {});
  if (!parsed.success) {
    const fieldErrors = firstFieldErrors(z.flattenError(parsed.error).fieldErrors);
    return NextResponse.json(
      { error: fieldErrors.userId ?? "sessions.errors.validation", fieldErrors },
      { status: 400 },
    );
  }

  const targetUserId = parsed.data.userId ?? session.user.id;
  const result = await addAttendee(id, targetUserId, session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, params: result.params },
      { status: attendeeMutationStatus(result.error) },
    );
  }

  scheduleSyncSweep();

  return NextResponse.json(
    { data: { sessionId: result.sessionId, userId: result.userId } },
    { status: 201 },
  );
}
