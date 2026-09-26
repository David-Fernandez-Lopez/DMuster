import { z } from "zod";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/**
 * Minimum password length enforced when a user sets a password. Public
 * registration no longer exists (roadmap #24) — the only path that sets one
 * today is `acceptInvitationSchema` (src/lib/validation/invitation.ts), which
 * reuses this constant.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Maximum length accepted for a user's display name. Reused by
 * `acceptInvitationSchema` for the same reason as `PASSWORD_MIN_LENGTH`.
 */
export const NAME_MAX_LENGTH = 100;

/**
 * Maximum length accepted for an email address, matching the `VARCHAR(191)`
 * columns that store one.
 *
 * Without it a longer address reached the database, where `STRICT_TRANS_TABLES`
 * aborts the insert; the generic catch turned that into a 500 and wrote the
 * rejected value into the server log. A 400 is the correct answer, and the log
 * stays free of attacker-chosen content.
 */
export const EMAIL_MAX_LENGTH = 191;

/**
 * Maximum length accepted for a password, in **bytes**.
 *
 * bcrypt reads only the first 72 bytes and silently ignores the rest, so
 * without a bound two different passwords sharing that prefix authenticate
 * interchangeably — and a password manager generating a long passphrase
 * produces a weaker credential than the person believes. Refusing anything
 * longer means every accepted password is hashed whole.
 *
 * Bytes rather than characters because that is what bcrypt counts: an accented
 * or emoji-bearing passphrase reaches the limit sooner than its length suggests.
 */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Reports whether a password fits within what bcrypt will actually read.
 *
 * @param {string} password - The candidate password.
 * @returns {boolean} True when it is at most `PASSWORD_MAX_BYTES` bytes.
 */
export function fitsPasswordLimit(password: string): boolean {
  return new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES;
}

/** Login form payload: an email and a non-empty password. */
export const loginSchema = z.object({
  email: z
    .email({ error: "auth.errors.invalidEmail" })
    .max(EMAIL_MAX_LENGTH, { error: "auth.errors.emailTooLong" }),
  password: z.string().min(1, { error: "auth.errors.required" }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * State returned by the auth server actions to `useActionState`. `error` is a
 * top-level i18n key; `fieldErrors` maps a field name to an i18n key. Both are
 * translated on the client — never user-facing text.
 */
export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Reduces a Zod `flatten().fieldErrors` map to a single i18n key per field
 * (the first issue wins), shaped for `AuthFormState.fieldErrors`.
 *
 * @param {Record<string, string[] | undefined>} fieldErrors - Zod field errors.
 * @returns {Record<string, string>} One i18n key per field with an error.
 */
export function firstFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      result[field] = messages[0];
    }
  }
  return result;
}
