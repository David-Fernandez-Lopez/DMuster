import { z } from "zod";

import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";

/**
 * State returned by the profile server actions to the client form.
 * `error` holds an i18n key when the update fails, translated client-side.
 * `fieldErrors` maps a field name to an i18n key, same shape as `AuthFormState`.
 */
export type ProfileActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Password change payload. The current password is required so a browser left
 * open on someone else's screen cannot be used to lock its owner out; the new
 * one reuses the same minimum length every other password in the app is held
 * to, and must be confirmed to catch a typo that would otherwise lock the user
 * out of an account whose sessions this very action is about to end.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "auth.errors.required" }),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { error: "auth.errors.passwordTooShort" }),
    confirmPassword: z.string().min(1, { error: "auth.errors.required" }),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    error: "auth.errors.passwordMismatch",
    path: ["confirmPassword"],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    error: "profile.errors.samePassword",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
