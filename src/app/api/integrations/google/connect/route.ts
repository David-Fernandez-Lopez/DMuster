import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { env, isGoogleSyncConfigured } from "@/lib/env";
import { buildConsentUrl, GOOGLE_OAUTH_NONCE_COOKIE, OAUTH_STATE_MAX_AGE_MS } from "@/lib/google/oauth";

/**
 * GET /api/integrations/google/connect — starts the Google OAuth consent
 * flow: builds a signed, single-use state, stores its nonce in an httpOnly
 * cookie, and redirects to Google's consent screen. 404s when the deployment
 * never configured Google OAuth, so the route behaves as if it does not
 * exist rather than leaking a half-usable integration.
 *
 * @returns {Promise<NextResponse>} 302 to Google's consent screen, or a JSON
 *   401/404.
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "integrations.google.errors.unauthorized" },
      { status: 401 },
    );
  }

  if (!isGoogleSyncConfigured) {
    return NextResponse.json(
      { error: "integrations.google.errors.notConfigured" },
      { status: 404 },
    );
  }

  const { url, nonce } = buildConsentUrl(session.user.id);

  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: OAUTH_STATE_MAX_AGE_MS / 1000,
    path: "/api/integrations/google",
  });

  return response;
}
