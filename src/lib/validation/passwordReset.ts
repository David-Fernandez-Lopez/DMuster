import { z } from "zod";

import {
  EMAIL_MAX_LENGTH,
  fitsPasswordLimit,
  PASSWORD_MIN_LENGTH,
} from "@/lib/validation/auth";

// Error messages are i18n keys, resolved on the client through `t(...)`.

/** Payload of the "forgot password" form: just an email address. */
export const requestPasswordResetSchema = z.object({
  email: z
    .email({ error: "auth.errors.invalidEmail" })
    .max(EMAIL_MAX_LENGTH, { error: "auth.errors.emailTooLong" }),
});

/** Payload of the "choose a new password" form. */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { error: "auth.errors.passwordTooShort" })
      .refine(fitsPasswordLimit, { error: "auth.errors.passwordTooLong" }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "auth.errors.passwordMismatch",
    path: ["confirmPassword"],
  });
