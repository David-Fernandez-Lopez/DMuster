import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { isGoogleSyncConfigured } from "@/lib/env";
import {
  exchangeCodeAndConnect,
  GOOGLE_OAUTH_NONCE_COOKIE,
  verifyOAuthCallback,
} from "@/lib/google/oauth";

/**
 * Builds a redirect back to `/profile` carrying the outcome as a `google`
 * search param, and always clears the nonce cookie — this is the flow's last
 * stop regardless of outcome, so the single-use cookie has done its job
 * either way.
 *
 * @param {NextRequest} request - The incoming callback request (used for its origin).
 * @param {"connected" | "already_linked" | "error"} outcome - The result to report.
 * @returns {NextResponse} The redirect response.
 */
function redirectToProfile(
  request: NextRequest,
  outcome: "connected" | "already_linked" | "error",
): NextResponse {
  const response = NextResponse.redirect(new URL(`/profile?google=${outcome}`, request.url));
  response.cookies.delete(GOOGLE_OAUTH_NONCE_COOKIE);
  return response;
}

/**
 * GET /api/integrations/google/callback — Google's redirect target after the
 * user grants or denies consent. Verifies the signed `state` against the
 * nonce cookie set by `/connect` (and cross-checks it names the still-signed
 * -in user, in case the browser session changed mid-flow) before exchanging
 * the code. Always lands back on `/profile` with the outcome in a `google`
 * query param — this is a top-level browser navigation, not a fetch, so
 * failures redirect rather than returning JSON.
 *
 * @param {NextRequest} request - Carries `code` and `state` as search params
 *   (Google omits `code` and includes `error` instead when the user declines
 *   consent).
 * @returns {Promise<NextResponse>} A redirect to `/login` (no session) or to
 *   `/profile?google=connected|already_linked|error`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!isGoogleSyncConfigured) {
    return redirectToProfile(request, "error");
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const nonceCookie = request.cookies.get(GOOGLE_OAUTH_NONCE_COOKIE)?.value;

  const verifiedUserId = verifyOAuthCallback(state, nonceCookie);
  if (!verifiedUserId || verifiedUserId !== session.user.id || !code) {
    return redirectToProfile(request, "error");
  }

  const result = await exchangeCodeAndConnect(verifiedUserId, code);
  if (!result.ok) {
    const outcome = result.error === "integrations.google.errors.alreadyLinked" ? "already_linked" : "error";
    return redirectToProfile(request, outcome);
  }

  return redirectToProfile(request, "connected");
}
