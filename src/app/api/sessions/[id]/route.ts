import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  authorizeSessionMutation,
  cancelSession,
  updateSession,
} from "@/lib/confirmedSessionService";
import { scheduleSyncSweep } from "@/lib/google/calendarSyncService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { updateSessionSchema } from "@/lib/validation/confirmedSession";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Maps an authorization failure from `authorizeSessionMutation` to its HTTP
 * status: "not found" covers a missing session, an already-cancelled one, and
 * a non-member alike (hides existence); "forbidden" is a member who is not a
 * DM of the session's campaign.
 *
 * @param {string} error - The i18n error key returned by the service.
 * @returns {number} 403 or 404.
 */
function authorizationStatus(error: string): number {
  return error === "sessions.errors.forbidden" ? 403 : 404;
}

/**
 * PUT /api/sessions/[id] — edits an active session's start time and duration
 * (a full replace: an omitted field clears it). Restricted to a DM of the
 * session's campaign. Authorization runs **before** body validation — ladder
 * 401 → 404 → 403 → 400 — mirroring `campaigns/[id]/route.ts`, since (unlike
 * `POST /api/sessions`) the session id is already known from the URL.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, 403, 404, or 500.
 */
export async function PUT(
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

  const authorized = await authorizeSessionMutation(id, session.user.id);
  if ("error" in authorized) {
    return NextResponse.json(
      { error: authorized.error },
      { status: authorizationStatus(authorized.error) },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSessionSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = firstFieldErrors(z.flattenError(parsed.error).fieldErrors);
    return NextResponse.json(
      {
        error:
          fieldErrors.startTime ??
          fieldErrors.durationMinutes ??
          "sessions.errors.validation",
        fieldErrors,
      },
      { status: 400 },
    );
  }

  const result = await updateSession(id, authorized, {
    startTime: parsed.data.startTime ?? null,
    durationMinutes: parsed.data.durationMinutes ?? null,
  });

  if (!result.ok) {
    const status = result.error === "sessions.errors.unknown" ? 500 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  scheduleSyncSweep();

  return NextResponse.json({ data: result.session });
}

/**
 * DELETE /api/sessions/[id] — cancels an active session (soft delete: the row
 * survives with `cancelledAt` set). Restricted to a DM of the session's
 * campaign. Ladder: 401 → 404 (missing, already cancelled, or non-member) →
 * 403 (member, not DM).
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 403, or 404.
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

  const { id } = await params;

  const result = await cancelSession(id, session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: authorizationStatus(result.error) },
    );
  }

  scheduleSyncSweep();

  return NextResponse.json({ data: { id: result.id } });
}
