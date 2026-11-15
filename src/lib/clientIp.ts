import { isIP } from "node:net";

/**
 * Extracts the client's IP from an `X-Forwarded-For` header value.
 *
 * Takes the **last** entry: that is the one the reverse proxy in front of the
 * app (Coolify) appends from the real connection, whereas everything before it
 * is whatever the client chose to send. This assumes exactly one proxy; behind
 * none (local dev) the header is normally absent and the result is null, so
 * the per-IP limit simply does not apply there.
 *
 * Anything that is not a well-formed IPv4/IPv6 address yields null, so no
 * arbitrary client-supplied text is ever stored.
 *
 * @param {string | null} forwardedFor - Raw `X-Forwarded-For` value, if any.
 * @returns {string | null} The client IP, or null when unknown.
 */
export function clientIpFromForwardedFor(forwardedFor: string | null): string | null {
  const last = forwardedFor?.split(",").at(-1)?.trim();
  return last && isIP(last) !== 0 ? last : null;
}
