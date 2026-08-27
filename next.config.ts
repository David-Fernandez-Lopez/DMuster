import type { NextConfig } from "next";

/**
 * Security headers sent with every response.
 *
 * Deliberately partial. Two entries are absent, and their absence is the
 * decision, not an oversight:
 *
 * - **No HSTS.** There is no TLS anywhere in this deployment. `Strict-Transport-Security`
 *   over plain HTTP is ignored by browsers, so it would be decoration — and if
 *   it ever were honoured against a hostname reachable over HTTP only, it would
 *   lock the app out of its own users' browsers. It goes in the day TLS does.
 * - **No full CSP yet**, beyond the one directive below. A content policy that
 *   restricts scripts and styles needs to be built against the app's real asset
 *   graph or it breaks the page, and the injection vectors it would defend
 *   against were looked for and not found. Worth doing; not worth guessing.
 *
 * What is here earns its place:
 *
 * - **Framing is refused outright.** `/holidays` carries a destructive action
 *   that reaches every campaign in the instance, and a page under someone
 *   else's control could otherwise put it under an invisible overlay and
 *   collect the tap. `frame-ancestors` is the directive browsers actually
 *   honour; `X-Frame-Options` stays alongside it for anything older.
 * - **`nosniff`** stops a response being reinterpreted as a type it did not
 *   declare.
 * - **`Referrer-Policy`** matters here for one URL in particular: an invitation
 *   link carries its single-use token in the path. Sending only the origin
 *   cross-origin keeps that token from travelling in a `Referer` header.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Generates .next/standalone — a self-contained bundle for production Docker images.
  // Has no effect on `next dev`.
  output: "standalone",

  // Removes `X-Powered-By: Next.js`, which only tells a visitor what to look up.
  poweredByHeader: false,

  /**
   * Applies the security headers to every response, API routes included.
   *
   * @returns {Promise<Array<{ source: string; headers: typeof SECURITY_HEADERS }>>}
   *   One rule matching every path.
   */
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
