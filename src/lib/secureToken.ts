// Random single-use tokens for links sent to people (invitations, password
// resets). Only `node:crypto` is imported, so it stays trivially testable.

import { createHash, randomBytes } from "node:crypto";

/** Number of random bytes backing a raw token (256 bits). */
const TOKEN_BYTES = 32;

/**
 * Generates a fresh random token, base64url encoded so it is safe to embed
 * directly in a URL path segment. The raw value is handed out once and never
 * persisted; only its hash is stored (see `hashSecureToken`).
 *
 * @returns {string} A new random raw token.
 */
export function generateSecureToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Hashes a raw token with SHA-256 for storage/lookup, so a leaked database dump
 * holds nothing that can be redeemed.
 *
 * @param {string} rawToken - The raw token, as handed out.
 * @returns {string} The token's SHA-256 hash, as lowercase hex.
 */
export function hashSecureToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
