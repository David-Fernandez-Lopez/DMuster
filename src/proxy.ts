import { NextResponse, type NextRequest } from "next/server";

// Routes the proxy never demands a session for. It lets them through
// unconditionally and leaves any redirect to the page itself, which can tell a
// real session from a mere cookie:
//   - /login must stay reachable even while holding a session cookie. The
//     cookie check below is optimistic — a cookie whose session row is gone
//     (expired and purged, revoked, or deleted to lock an attacker out) still
//     looks signed in from here. Bouncing it to "/" sent the visitor to a page
//     that redirects back to /login, and around again: an inescapable loop with
//     no way out but clearing the cookie by hand on every device. That made
//     "delete the sessions" unusable as a revocation tool, which is the only
//     one this application currently has.
//   - /invite links (roadmap #24) must render their own state — an explanation,
//     or the accept form — for whoever opens them, instead of a signed-in
//     visitor silently bouncing to "/" before ever seeing the page.
const UNPROTECTED_ROUTES = ["/login", "/invite"];

// Cookie names Auth.js uses for the session token (secure prefix in production).
const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

/**
 * Reports whether `pathname` is (or is nested under) one of `routes`.
 *
 * @param {string} pathname - The request's path.
 * @param {string[]} routes - Route prefixes to match against.
 * @returns {boolean} True when `pathname` matches or is nested under a route.
 */
function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Route-protection proxy (Next.js `proxy.ts`, the successor to `middleware.ts`).
 *
 * Because sessions live in the database and the proxy can't open a DB
 * connection, it does an **optimistic** check on the presence of the session
 * cookie. That check can only ever be trusted in one direction: no cookie means
 * definitely not signed in, but a cookie means *maybe*. So the proxy only acts
 * on the reliable direction, and every decision that needs certainty is left to
 * the pages, which verify with `auth()`:
 * - No cookie on a protected route → redirect to `/login`.
 * - An unprotected route (`/login`, `/invite/*`) → always passes through. The
 *   page decides what a signed-in visitor sees.
 * - `/register` no longer exists (roadmap #24 removed public sign-up) →
 *   redirect to `/login` so old links and bookmarks don't 404.
 *
 * @param {NextRequest} request - Incoming request.
 * @returns {NextResponse} Redirect or pass-through response.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname === "/register" || pathname.startsWith("/register/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (matchesRoute(pathname, UNPROTECTED_ROUTES)) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(SECURE_SESSION_COOKIE);

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on every path except Auth.js API routes, Next internals, and static
  // assets (favicon, metadata icons, images). Otherwise the proxy would
  // redirect an anonymous request for /icon.svg to /login. Protected API
  // routes guard themselves and return 401 directly.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)",
  ],
};
