// Single place that decides how passwords are hashed, so every path that sets
// one (sign-up, profile change, password reset, seed) costs the same.

import bcrypt from "bcryptjs";

/** bcrypt cost factor. */
export const BCRYPT_COST = 10;

/**
 * Hashes a password with bcrypt at `BCRYPT_COST`.
 *
 * @param {string} password - The plain-text password (already length-checked).
 * @returns {Promise<string>} The bcrypt hash.
 */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}
