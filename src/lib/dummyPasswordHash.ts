/**
 * Shape of a bcrypt hash: the `$2a$`/`$2b$`/`$2y$` identifier, a two-digit cost
 * factor, and 53 characters of bcrypt-alphabet salt and digest — 60 in total.
 */
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Bcrypt hash of a random string, compared against when no user matches the
 * submitted email. Running a real hash comparison on the not-found path makes
 * it cost the same as the found path, so response time does not reveal which
 * email addresses have an account.
 *
 * The value must be a *well-formed* bcrypt hash, which is why it is asserted
 * below rather than trusted. bcryptjs rejects any hash that is not exactly 60
 * characters and returns `false` immediately, without deriving anything — so a
 * malformed constant here does not merely weaken the defence, it inverts it:
 * the not-found path would return in microseconds while the found path spends
 * the full cost-10 derivation, making enumeration by timing easier than with no
 * mitigation at all.
 */
export const DUMMY_PASSWORD_HASH =
  "$2b$10$Qsu9ykkLwW6wA/57ZCTS.uMzEpYH2/.P6V8kKaWuw5CEbZgs2YZCu";

// Asserted at module load: a constant that silently stopped being a valid hash
// would leave no trace at runtime, since the comparison it feeds is expected to
// return false either way. Failing here turns a silent security regression into
// a refusal to start.
if (!BCRYPT_HASH_PATTERN.test(DUMMY_PASSWORD_HASH)) {
  throw new Error(
    "[AUTH/DUMMY-HASH] DUMMY_PASSWORD_HASH is not a well-formed bcrypt hash " +
      `(got ${DUMMY_PASSWORD_HASH.length} characters, expected 60). ` +
      "bcrypt would short-circuit on it and invert the timing defence it exists for.",
  );
}
