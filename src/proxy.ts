import { NextResponse, type NextRequest } from "next/server";

// Routes that anonymous users may reach; an already-signed-in visitor is
// bounced to "/" (e.g. opening /login while logged in).
const PUBLIC_ROUTES = ["/login"];

// Routes open to anonymous AND signed-in visitors alike — neither redirect
// applies. Invitation links (roadmap #24) must render their own state (an
// explanation, or the accept form) for whoever opens them, instead of a
// signed-in visitor silently bouncing to "/" before ever seeing the page.
const OPEN_ROUTES = ["/invite"];

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
 * cookie — real verification happens in pages/handlers via `auth()`:
 * - No cookie on a protected route → redirect to `/login`.
 * - Cookie present on a public route (`/login`) → redirect to `/` (already
 *   signed in).
 * - An open route (`/invite/*`) → always passes through, regardless of session.
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

  if (matchesRoute(pathname, OPEN_ROUTES)) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(SECURE_SESSION_COOKIE);

  if (matchesRoute(pathname, PUBLIC_ROUTES)) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

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
