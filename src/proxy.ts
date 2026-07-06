import { NextResponse, type NextRequest } from "next/server";

// Routes that anonymous users may reach. Everything else requires a session.
const PUBLIC_ROUTES = ["/login", "/register"];

// Cookie names Auth.js uses for the session token (secure prefix in production).
const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

/**
 * Route-protection proxy (Next.js `proxy.ts`, the successor to `middleware.ts`).
 *
 * Because sessions live in the database and the proxy can't open a DB
 * connection, it does an **optimistic** check on the presence of the session
 * cookie — real verification happens in pages/handlers via `auth()`:
 * - No cookie on a protected route → redirect to `/login`.
 * - Cookie present on an auth route → redirect to `/` (already signed in).
 *
 * @param {NextRequest} request - Incoming request.
 * @returns {NextResponse} Redirect or pass-through response.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(SECURE_SESSION_COOKIE);
  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isPublic) {
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
