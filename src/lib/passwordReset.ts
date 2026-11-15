// Pure token/limit helpers for password recovery. No Prisma/Next — so this
// stays trivially unit-testable, like `invitation.ts`.

import { generateSecureToken, hashSecureToken } from "@/lib/secureToken";

/** How long a reset link stays usable. Short: it is a credential in an inbox. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/** Requests allowed per email within `RATE_LIMIT_WINDOW_MINUTES`. */
export const RESET_MAX_REQUESTS_PER_EMAIL = 3;

/** Requests allowed per IP address within `RATE_LIMIT_WINDOW_MINUTES`. */
export const RESET_MAX_REQUESTS_PER_IP = 10;

/** Sliding window the two limits above are counted over. */
export const RATE_LIMIT_WINDOW_MINUTES = 60;

/** How long a `PasswordResetLog` row is kept before it is pruned. */
export const PASSWORD_RESET_LOG_RETENTION_DAYS = 90;

/** How long a token that can no longer be redeemed is kept before it is pruned. */
export const PASSWORD_RESET_TOKEN_RETENTION_DAYS = 1;

/**
 * Generates a fresh single-use reset token, base64url encoded so it can sit in
 * a URL path segment. The raw value is mailed once and never persisted.
 *
 * @returns {string} A new random raw token.
 */
export function generatePasswordResetToken(): string {
  return generateSecureToken();
}

/**
 * Hashes a raw reset token with SHA-256 for storage/lookup, so a leaked
 * database dump cannot be used to take over accounts.
 *
 * @param {string} rawToken - The raw token, as mailed to the user.
 * @returns {string} The token's SHA-256 hash, as lowercase hex.
 */
export function hashPasswordResetToken(rawToken: string): string {
  return hashSecureToken(rawToken);
}

/**
 * Computes when a token issued at `now` stops being valid.
 *
 * @param {Date} now - The current time, passed in so tests stay deterministic.
 * @returns {Date} The token's expiry instant.
 */
export function passwordResetExpiresAt(now: Date): Date {
  return new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
}

/**
 * Start of the rate-limit window ending at `now`.
 *
 * @param {Date} now - The current time.
 * @returns {Date} Requests logged at or after this instant count towards the limits.
 */
export function rateLimitWindowStart(now: Date): Date {
  return new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
}

/** The subset of `PasswordResetToken` needed to decide whether it is usable. */
export type PasswordResetTokenState = {
  usedAt: Date | null;
  supersededAt: Date | null;
  expiresAt: Date;
};

/**
 * Reports whether a reset token can still be redeemed.
 *
 * @param {PasswordResetTokenState} token - The token's lifecycle fields.
 * @param {Date} now - The current time.
 * @returns {boolean} True when it is unused, not superseded by a newer link and not yet expired.
 */
export function isPasswordResetTokenUsable(
  token: PasswordResetTokenState,
  now: Date,
): boolean {
  return (
    token.usedAt === null &&
    token.supersededAt === null &&
    now.getTime() < token.expiresAt.getTime()
  );
}

/**
 * Cut-off instants for pruning: log rows created before `logsBefore`, and
 * tokens whose expiry passed before `tokensBefore`, are deleted.
 *
 * @param {Date} now - The current time.
 * @returns {{ logsBefore: Date; tokensBefore: Date }} The two cut-offs.
 */
export function pruneCutoffs(now: Date): { logsBefore: Date; tokensBefore: Date } {
  const day = 24 * 60 * 60 * 1000;
  return {
    logsBefore: new Date(now.getTime() - PASSWORD_RESET_LOG_RETENTION_DAYS * day),
    tokensBefore: new Date(now.getTime() - PASSWORD_RESET_TOKEN_RETENTION_DAYS * day),
  };
}

/**
 * Name of the MySQL user-level lock that serialises requests for one email, so
 * the per-email limit is counted and enforced atomically. Built from a hash so
 * no address ends up in the server's lock table, and kept under MySQL's
 * 64-character limit.
 *
 * @param {string} email - Normalised (trimmed, lowercased) email.
 * @returns {string} The lock name.
 */
export function passwordResetLockName(email: string): string {
  return `pwreset:${hashSecureToken(email).slice(0, 40)}`;
}
