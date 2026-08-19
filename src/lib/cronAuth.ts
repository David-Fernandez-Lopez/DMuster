import { timingSafeEqual } from "node:crypto";

/**
 * Reports whether the `x-cron-secret` header matches the configured secret,
 * comparing in constant time so response timing can't leak the secret one
 * byte at a time. Shared by every `/api/cron/*` route.
 *
 * @param {Request} request - The incoming request.
 * @param {string} secret - The configured `CRON_SECRET`.
 * @returns {boolean} True when the header matches.
 */
export function hasValidCronSecret(request: Request, secret: string): boolean {
  const provided = Buffer.from(request.headers.get("x-cron-secret") ?? "");
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
