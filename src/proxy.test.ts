import { NextRequest } from "next/server";

import { proxy } from "@/proxy";

const SESSION_COOKIE = "authjs.session-token";

/**
 * Builds a request for `path`, optionally carrying a session cookie. The value
 * is arbitrary: the proxy only ever checks whether the cookie is present, which
 * is precisely why it cannot be trusted to mean "signed in".
 *
 * @param {string} path - Path to request, e.g. "/login".
 * @param {{ cookie?: string }} [options] - Set `cookie` to send a session cookie.
 * @returns {NextRequest} The request to hand to the proxy.
 */
function request(path: string, options: { cookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (options.cookie) {
    headers.set("cookie", `${SESSION_COOKIE}=${options.cookie}`);
  }
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

/**
 * Extracts where a response sends the visitor, or `null` when it lets the
 * request through.
 *
 * @param {Response} response - The proxy's response.
 * @returns {string | null} The redirect target's pathname, or null.
 */
function redirectTarget(response: Response): string | null {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
}

describe("proxy", () => {
  describe("/login stays reachable", () => {
    // The regression this whole file exists for. The cookie check is optimistic:
    // a cookie whose session row is gone still looks signed in. Redirecting it
    // to "/" — which redirects back to /login — trapped the visitor in a loop
    // with no way out but clearing the cookie by hand, and made deleting session
    // rows unusable as a way to revoke access.
    it("lets a request through even when a session cookie is present", () => {
      const response = proxy(request("/login", { cookie: "stale-token" }));

      expect(redirectTarget(response)).toBeNull();
    });

    it("lets an anonymous request through", () => {
      const response = proxy(request("/login"));

      expect(redirectTarget(response)).toBeNull();
    });
  });

  describe("protected routes", () => {
    it("sends an anonymous visitor to /login", () => {
      const response = proxy(request("/campaigns"));

      expect(redirectTarget(response)).toBe("/login");
    });

    it("lets a visitor holding a session cookie through", () => {
      const response = proxy(request("/campaigns", { cookie: "token" }));

      expect(redirectTarget(response)).toBeNull();
    });
  });

  describe("invitation links", () => {
    it("lets an anonymous visitor through", () => {
      const response = proxy(request("/invite/abc123"));

      expect(redirectTarget(response)).toBeNull();
    });

    it("lets a signed-in visitor through, so the page can render its own state", () => {
      const response = proxy(request("/invite/abc123", { cookie: "token" }));

      expect(redirectTarget(response)).toBeNull();
    });
  });

  describe("/register", () => {
    // Public sign-up was removed in roadmap #24; old links must not 404.
    it("redirects to /login", () => {
      const response = proxy(request("/register"));

      expect(redirectTarget(response)).toBe("/login");
    });

    it("redirects nested paths to /login", () => {
      const response = proxy(request("/register/confirm"));

      expect(redirectTarget(response)).toBe("/login");
    });
  });
});
