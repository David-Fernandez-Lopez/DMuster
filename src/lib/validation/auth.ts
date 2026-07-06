import { z } from "zod";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/** Minimum password length enforced on registration. */
export const PASSWORD_MIN_LENGTH = 8;

/** Maximum length accepted for a user's display name. */
export const NAME_MAX_LENGTH = 100;

/** Login form payload: an email and a non-empty password. */
export const loginSchema = z.object({
  email: z.email({ error: "auth.errors.invalidEmail" }),
  password: z.string().min(1, { error: "auth.errors.required" }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Registration form payload. Password and its confirmation must match; the
 * mismatch is reported on the `confirmPassword` field.
 */
export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "auth.errors.nameRequired" })
      .max(NAME_MAX_LENGTH, { error: "auth.errors.nameTooLong" }),
    email: z.email({ error: "auth.errors.invalidEmail" }),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { error: "auth.errors.passwordTooShort" }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "auth.errors.passwordMismatch",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

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
