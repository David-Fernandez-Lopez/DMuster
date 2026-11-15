// Pure token/status helpers for invitation-only access (roadmap #24). Only
// `node:crypto` is reached (via secureToken.ts) — no Prisma/Next — so this stays trivially
// unit-testable, mirroring roadmap #17's precedent with viability.ts and
// #23's oauthState.ts.

import { generateSecureToken, hashSecureToken } from "@/lib/secureToken";

/** How long a freshly created invitation stays acceptable. */
export const INVITATION_TTL_DAYS = 7;

/** The subset of `Invitation` fields needed to derive its lifecycle state. */
export type InvitationLifecycle = {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
};

/** Derived lifecycle state of an invitation. */
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/**
 * Generates a fresh single-use invitation token: 32 random bytes, base64url
 * encoded so it is safe to embed directly in a URL path segment. This raw
 * value exists exactly once — in the response that creates the invitation —
 * and is never persisted; only its hash is stored (see `hashInvitationToken`).
 *
 * @returns {string} A new random raw token.
 */
export function generateInvitationToken(): string {
  return generateSecureToken();
}

/**
 * Hashes a raw invitation token with SHA-256 for storage/lookup. The database
 * only ever holds this hash, never the raw token, so a leaked database dump
 * cannot be used to accept invitations.
 *
 * @param {string} rawToken - The raw token, as handed to the invitee.
 * @returns {string} The token's SHA-256 hash, as lowercase hex.
 */
export function hashInvitationToken(rawToken: string): string {
  return hashSecureToken(rawToken);
}

/**
 * Computes the `expiresAt` timestamp for an invitation created right now:
 * `INVITATION_TTL_DAYS` days out.
 *
 * @param {Date} now - The current time, passed in rather than read internally
 *   so callers stay deterministic in tests.
 * @returns {Date} The invitation's expiry instant.
 */
export function invitationExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Derives an invitation's lifecycle state. Precedence when several timestamps
 * are set: an accepted invitation reads as `"accepted"` even past its expiry
 * (it was used while still valid); a revoked-but-unaccepted one reads as
 * `"revoked"`; otherwise it is `"expired"` once `now` reaches `expiresAt`, and
 * `"pending"` before that.
 *
 * @param {InvitationLifecycle} invitation - The invitation's lifecycle fields.
 * @param {Date} now - The current time, passed in rather than read internally
 *   so callers stay deterministic in tests.
 * @returns {InvitationStatus} The derived status.
 */
export function invitationStatus(
  invitation: InvitationLifecycle,
  now: Date,
): InvitationStatus {
  if (invitation.acceptedAt) {
    return "accepted";
  }
  if (invitation.revokedAt) {
    return "revoked";
  }
  if (now.getTime() >= invitation.expiresAt.getTime()) {
    return "expired";
  }
  return "pending";
}
