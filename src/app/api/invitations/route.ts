import { NextResponse } from "next/server";
import { z } from "zod";

import { CampaignRole } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { isDmOfAnyCampaign } from "@/lib/authz";
import { env } from "@/lib/env";
import { createInvitation } from "@/lib/invitationService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { createInvitationSchema } from "@/lib/validation/invitation";

/**
 * Maps a failed `createInvitation` call to its HTTP status: not being a DM of
 * the named campaign is 403 (mirrors the coarse DM-of-any gate below), an
 * unexpected failure is 500, and every other key (email already has an
 * account, or already has a pending invitation) is 400.
 *
 * @param {string} error - The i18n error key returned by the service.
 * @returns {number} The HTTP status to respond with.
 */
function createErrorStatus(error: string): number {
  if (error === "invitations.errors.forbidden") {
    return 403;
  }
  if (error === "invitations.errors.unknown") {
    return 500;
  }
  return 400;
}

/**
 * POST /api/invitations — creates a single-use invitation. Restricted to a
 * user who is DM of at least one campaign (no global admin role —
 * CLAUDE.md §4), same signal as `/api/holidays`. That coarse check runs before
 * body validation; a *specific* campaign named in the body is authorized
 * separately by the service (DM of that campaign) once parsed. Success embeds
 * the one-time raw token in `url`, built from `AUTH_URL` when configured so a
 * deployment behind a reverse proxy emits its public origin rather than an
 * internal request URL.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @returns {Promise<NextResponse>} 201, 400, 401, 403, or 500.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "invitations.errors.unauthorized" },
      { status: 401 },
    );
  }

  if (!(await isDmOfAnyCampaign(session.user.id))) {
    return NextResponse.json(
      { error: "invitations.errors.forbidden" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createInvitationSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = firstFieldErrors(z.flattenError(parsed.error).fieldErrors);
    return NextResponse.json(
      {
        error:
          fieldErrors.email ??
          fieldErrors.campaignId ??
          fieldErrors.role ??
          "invitations.errors.validation",
        fieldErrors,
      },
      { status: 400 },
    );
  }

  const result = await createInvitation({
    email: parsed.data.email,
    campaignId: parsed.data.campaignId,
    role: parsed.data.role as CampaignRole | undefined,
    invitedById: session.user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: createErrorStatus(result.error) },
    );
  }

  const origin = env.AUTH_URL ?? new URL(request.url).origin;
  const url = new URL(`/invite/${result.token}`, origin).toString();

  return NextResponse.json(
    { data: { invitation: result.invitation, url } },
    { status: 201 },
  );
}
