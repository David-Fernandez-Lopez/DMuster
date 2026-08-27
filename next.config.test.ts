import nextConfig from "./next.config";

/**
 * Reads the headers the config declares for every path, flattened to a plain
 * lookup so assertions read as "this header has this value".
 *
 * @returns {Promise<Record<string, string>>} Header name to value.
 */
async function headersForEveryPath(): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const everyPath = rules.find((rule) => rule.source === "/:path*");

  return Object.fromEntries(
    (everyPath?.headers ?? []).map((header) => [header.key, header.value]),
  );
}

describe("security headers", () => {
  it("refuses framing", async () => {
    // /holidays carries a destructive action that reaches every campaign in the
    // instance, so a page under someone else's control must not be able to put
    // it behind an invisible overlay and collect the tap.
    const headers = await headersForEveryPath();

    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("stops content-type sniffing", async () => {
    expect((await headersForEveryPath())["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("keeps invitation tokens out of the Referer header", async () => {
    // An invitation link carries its single-use token in the path, so a
    // cross-origin request must send the origin and nothing more.
    const policy = (await headersForEveryPath())["Referrer-Policy"];

    expect(policy).toBe("strict-origin-when-cross-origin");
  });

  describe("deliberate omissions", () => {
    it("sends no HSTS, because there is no TLS to enforce", async () => {
      // Ignored over plain HTTP, and actively harmful if ever honoured against
      // a hostname only reachable without TLS. It goes in the day TLS does.
      expect(await headersForEveryPath()).not.toHaveProperty("Strict-Transport-Security");
    });

    it("declares no policy beyond framing", async () => {
      // A CSP restricting scripts and styles has to be built against the real
      // asset graph or it breaks the page. Guarding this so nobody widens the
      // directive list without meaning to.
      const policy = (await headersForEveryPath())["Content-Security-Policy"];

      expect(policy).toBe("frame-ancestors 'none'");
    });
  });

  it("does not advertise the framework", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
