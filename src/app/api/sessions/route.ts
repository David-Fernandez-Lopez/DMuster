import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { confirmSession } from "@/lib/confirmedSessionService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { confirmSessionSchema } from "@/lib/validation/confirmedSession";

/** Error keys that mean the campaign/session was not found or not owned. */
const NOT_FOUND_ERRORS = new Set(["sessions.errors.notFound"]);

/** Error keys that mean the caller is a member but not a DM. */
const FORBIDDEN_ERRORS = new Set(["sessions.errors.forbidden"]);

/**
 * Maps a failed session mutation to its HTTP status: unknown/missing campaign
 * is 404, a member-but-not-DM is 403, an unexpected failure is 500, and every
 * other key (validation and business-rule errors — invalid date/time,
 * ineligible day, non-`S` viability, a double-submit, a shared-attendee
 * conflict) is 400.
 *
 * @param {string} error - The i18n error key returned by the service.
 * @returns {number} The HTTP status to respond with.
 */
function mutationErrorStatus(error: string): number {
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
 * POST /api/sessions — confirms a campaign as playing on an eligible day.
 * Restricted to a DM of the campaign. The campaign id lives in the body (not
 * the URL), so it must be parsed before authorization can even be checked —
 * the ladder is therefore 401 → body validation (400) → 404 (campaign/DM
 * lookup, bundled in `confirmSession`) → 403 → 400 (business rules: not
 * eligible, not viable, already confirmed, shared-attendee conflict). A
 * `playerConflict` failure carries `params` for the translated message
 * (`{{campaign}}`, `{{players}}`).
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @returns {Promise<NextResponse>} 201, 400, 401, 403, 404, or 500.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "sessions.errors.unauthorized" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = confirmSessionSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = firstFieldErrors(z.flattenError(parsed.error).fieldErrors);
    return NextResponse.json(
      {
        error:
          fieldErrors.date ??
          fieldErrors.startTime ??
          fieldErrors.durationMinutes ??
          fieldErrors.campaignId ??
          "sessions.errors.validation",
        fieldErrors,
      },
      { status: 400 },
    );
  }

  const result = await confirmSession({
    campaignId: parsed.data.campaignId,
    dateIso: parsed.data.date,
    startTime: parsed.data.startTime ?? null,
    durationMinutes: parsed.data.durationMinutes ?? null,
    userId: session.user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, params: result.params },
      { status: mutationErrorStatus(result.error) },
    );
  }

  return NextResponse.json({ data: result.session }, { status: 201 });
}
