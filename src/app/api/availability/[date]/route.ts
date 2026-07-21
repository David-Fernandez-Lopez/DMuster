import { NextResponse } from "next/server";
import { z } from "zod";

import {
  clearAvailability,
  setAvailability,
} from "@/lib/availabilityService";
import { auth } from "@/lib/auth";
import { isEligible } from "@/lib/date";
import { listHolidays } from "@/lib/holidayService";
import { firstFieldErrors } from "@/lib/validation/auth";
import {
  availabilityBodySchema,
  availabilityDateSchema,
} from "@/lib/validation/availability";

type RouteContext = { params: Promise<{ date: string }> };

/**
 * Runs the guard ladder shared by PUT and DELETE and, on success, yields the
 * authenticated user id plus the validated date. Order: 401 when
 * unauthenticated → 400 on a malformed date → 400 when the date is not an
 * eligible (playable) day. Eligibility is enforced here, not in Zod, because it
 * needs the holiday set from the database. The endpoint only ever acts on the
 * session user — no userId is read from the request — so other players' rows
 * are structurally unreachable.
 *
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<{ userId: string; date: string } | { response: NextResponse }>}
 *   The resolved request, or the error response to return.
 */
async function resolveEligibleRequest(
  context: RouteContext,
): Promise<{ userId: string; date: string } | { response: NextResponse }> {
  const session = await auth();
  if (!session?.user) {
    return {
      response: NextResponse.json(
        { error: "availability.errors.unauthorized" },
        { status: 401 },
      ),
    };
  }

  const { date } = await context.params;
  if (!availabilityDateSchema.safeParse(date).success) {
    return {
      response: NextResponse.json(
        { error: "availability.errors.invalidDate" },
        { status: 400 },
      ),
    };
  }

  const holidays = new Set((await listHolidays()).map((holiday) => holiday.date));
  if (!isEligible(date, holidays)) {
    return {
      response: NextResponse.json(
        { error: "availability.errors.notEligible" },
        { status: 400 },
      ),
    };
  }

  return { userId: session.user.id, date };
}

/**
 * PUT /api/availability/[date] — sets the session user's own response for the
 * day. Body `{ status: "YES" | "NO" | "MAYBE" }`. Ladder: 401 → 400 invalid date → 400
 * not eligible → 400 invalid body. The proxy excludes `/api`, so this handler
 * guards itself.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, or 500.
 */
export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const resolved = await resolveEligibleRequest(context);
  if ("response" in resolved) {
    return resolved.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = availabilityBodySchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = firstFieldErrors(z.flattenError(parsed.error).fieldErrors);
    return NextResponse.json(
      {
        error: fieldErrors.status ?? "availability.errors.unknown",
        fieldErrors,
      },
      { status: 400 },
    );
  }

  const result = await setAvailability(
    resolved.userId,
    resolved.date,
    parsed.data.status,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    data: { date: resolved.date, status: parsed.data.status },
  });
}

/**
 * DELETE /api/availability/[date] — clears the session user's own response for
 * the day. Idempotent: clearing an unanswered day still succeeds. Ladder: 401 →
 * 400 invalid date → 400 not eligible.
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 400, 401, or 500.
 */
export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const resolved = await resolveEligibleRequest(context);
  if ("response" in resolved) {
    return resolved.response;
  }

  const result = await clearAvailability(resolved.userId, resolved.date);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: { date: resolved.date } });
}
