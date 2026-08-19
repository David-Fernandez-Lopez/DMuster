// Signs and verifies the single-use `state` param for the Google OAuth
// consent flow (roadmap #23) — CSRF protection so a completed callback can
// only be redeemed by the browser that started it. Free of Prisma/Next
// imports (only `node:crypto`) so it stays trivially unit-testable, mirroring
// roadmap #17's precedent with viability.ts.

import { createHmac, timingSafeEqual } from "node:crypto";

/** The claims carried inside a signed OAuth state. */
export type OAuthStatePayload = {
  userId: string;
  nonce: string;
};

type SignedStateClaims = OAuthStatePayload & { iat: number };

/**
 * Signs an OAuth state payload with HMAC-SHA256, so a tampered or forged
 * `state` value is rejected by `verifyState`. The payload (base64url JSON)
 * and its signature are joined with a dot — the shape of a JWT without
 * pulling in a JWT library for a single-use, server-only token.
 *
 * @param {OAuthStatePayload} payload - The user id starting the flow and a
 *   random nonce that is also stored in an httpOnly cookie — the returned
 *   state must match BOTH to be accepted, see `verifyState`.
 * @param {string} secret - HMAC signing key (`env.AUTH_SECRET`).
 * @returns {string} The signed state, safe to place in a URL query string.
 */
export function signState(payload: OAuthStatePayload, secret: string): string {
  const claims: SignedStateClaims = { ...payload, iat: Date.now() };
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

/**
 * Verifies a signed OAuth state: the signature must match — compared in
 * constant time so response timing can't leak how many bytes matched — and
 * the claims must not be older than `maxAgeMs`. Returns null on any failure
 * (malformed input, bad signature, or expiry) without distinguishing which,
 * so a forged state can't be used to probe the signing key.
 *
 * @param {string} raw - The state value returned by Google's redirect.
 * @param {string} secret - The same key used to sign it.
 * @param {number} maxAgeMs - Maximum age, in milliseconds, to still accept.
 * @returns {OAuthStatePayload | null} The verified payload, or null.
 */
export function verifyState(
  raw: string,
  secret: string,
  maxAgeMs: number,
): OAuthStatePayload | null {
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", secret).update(encoded).digest("base64url");
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let claims: SignedStateClaims;
  try {
    claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof claims.userId !== "string" ||
    typeof claims.nonce !== "string" ||
    typeof claims.iat !== "number"
  ) {
    return null;
  }
  if (Date.now() - claims.iat > maxAgeMs) {
    return null;
  }

  return { userId: claims.userId, nonce: claims.nonce };
}
