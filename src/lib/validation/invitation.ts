import { z } from "zod";

import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/**
 * Payload for creating an invitation: who it is for, and optionally which
 * campaign (and role in it) accepting also joins. `role` only makes sense
 * together with a `campaignId`, so it is refined as a pair.
 */
export const createInvitationSchema = z
  .object({
    email: z.email({ error: "auth.errors.invalidEmail" }),
    campaignId: z.string().trim().min(1).optional(),
    role: z.enum(["DM", "PLAYER"], { error: "invitations.errors.validation" }).optional(),
  })
  .refine((data) => data.role === undefined || data.campaignId !== undefined, {
    error: "invitations.errors.roleWithoutCampaign",
    path: ["role"],
  });

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

/**
 * Payload for accepting an invitation: name and password only — the email is
 * fixed by the invitation itself and is never submitted by the form.
 */
export const acceptInvitationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "auth.errors.nameRequired" })
      .max(NAME_MAX_LENGTH, { error: "auth.errors.nameTooLong" }),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { error: "auth.errors.passwordTooShort" }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "auth.errors.passwordMismatch",
    path: ["confirmPassword"],
  });

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
