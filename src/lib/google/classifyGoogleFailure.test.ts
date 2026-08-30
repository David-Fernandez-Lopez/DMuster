import { classifyGoogleFailure } from "@/lib/google/calendarClient";

/**
 * Builds a stand-in for a failed Google response.
 *
 * @param {number} status - The HTTP status.
 * @param {unknown} body - The JSON body, or undefined for a body that fails to parse.
 * @returns {Response} Something `classifyGoogleFailure` can read.
 */
function failure(status: number, body?: unknown): Response {
  return {
    status,
    json: async () => {
      if (body === undefined) {
        throw new Error("not json");
      }
      return body;
    },
  } as unknown as Response;
}

/** A Google error body with the given `reason` on its first entry. */
function withReason(reason: string, message = "Something went wrong"): unknown {
  return { error: { message, errors: [{ reason }] } };
}

describe("classifyGoogleFailure", () => {
  it("treats 401 as an auth failure whatever the body says", async () => {
    const result = await classifyGoogleFailure(failure(401, withReason("rateLimitExceeded")));

    expect(result.authFailure).toBe(true);
  });

  describe("403", () => {
    // The whole point. Google answers 403 both for a token it will not accept
    // and for a quota that ran out. Treating them alike meant one burst of
    // activity marked the connection broken — and since the quota is per
    // project, that verdict landed on whoever's row came next, however healthy
    // their own token was.
    it.each([
      ["rateLimitExceeded"],
      ["userRateLimitExceeded"],
      ["quotaExceeded"],
      ["dailyLimitExceeded"],
    ])("is retryable when the reason is %s", async (reason) => {
      const result = await classifyGoogleFailure(failure(403, withReason(reason)));

      expect(result.authFailure).toBe(false);
    });

    it("is retryable when the body says RESOURCE_EXHAUSTED", async () => {
      const result = await classifyGoogleFailure(
        failure(403, { error: { message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } }),
      );

      expect(result.authFailure).toBe(false);
    });

    it.each([["authError"], ["forbidden"], ["insufficientPermissions"]])(
      "is an auth failure when the reason is %s",
      async (reason) => {
        const result = await classifyGoogleFailure(failure(403, withReason(reason)));

        expect(result.authFailure).toBe(true);
      },
    );

    // Erring towards "the token is bad" on an unreadable 403 keeps the previous
    // behaviour for anything unrecognised: the row is left alone rather than
    // burning its attempt budget on something that may never recover.
    it("is an auth failure when the body cannot be read", async () => {
      const result = await classifyGoogleFailure(failure(403));

      expect(result.authFailure).toBe(true);
    });
  });

  it("flags a 404 without calling it an auth failure", async () => {
    const result = await classifyGoogleFailure(failure(404, withReason("notFound")));

    expect(result).toMatchObject({ authFailure: false, notFound: true });
  });

  it.each([[429], [500], [503]])("treats %s as retryable", async (status) => {
    const result = await classifyGoogleFailure(failure(status, withReason("backendError")));

    expect(result).toMatchObject({ authFailure: false, notFound: false });
  });

  describe("the diagnostic string", () => {
    it("carries Google's own message", async () => {
      const result = await classifyGoogleFailure(failure(403, withReason("quotaExceeded", "Rate Limit Exceeded")));

      expect(result.errorMessage).toBe("403 Rate Limit Exceeded");
    });

    it("falls back to the bare status", async () => {
      const result = await classifyGoogleFailure(failure(500));

      expect(result.errorMessage).toBe("HTTP 500");
    });
  });
});
