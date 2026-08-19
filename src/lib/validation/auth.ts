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

/** Login form payload: an email and a non-empty password. */
export const loginSchema = z.object({
  email: z.email({ error: "auth.errors.invalidEmail" }),
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
