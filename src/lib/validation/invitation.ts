import { z } from "zod";

import {
  EMAIL_MAX_LENGTH,
  fitsPasswordLimit,
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/validation/auth";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/**
 * Characters a display name may contain: letters in any script, digits,
 * spaces, and the punctuation that shows up in real names (apostrophes,
 * hyphens, dots, commas, parentheses).
 *
 * Written as what is allowed rather than what is forbidden, so anything nobody
 * thought of — angle brackets, control characters, zero-width joiners — is out
 * by default rather than by having been remembered.
 *
 * Also enforced by the seed (prisma/seedEnv.ts) on the bootstrap account's name.
 */
export const SAFE_NAME_PATTERN = /^[\p{L}\p{N} '’·.,\-()]+$/u;

/**
 * Payload for creating an invitation: who it is for, and optionally which
 * campaign (and role in it) accepting also joins. `role` only makes sense
 * together with a `campaignId`, so it is refined as a pair.
 */
export const createInvitationSchema = z
  .object({
    email: z
      .email({ error: "auth.errors.invalidEmail" })
      .max(EMAIL_MAX_LENGTH, { error: "auth.errors.emailTooLong" }),
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
      .max(NAME_MAX_LENGTH, { error: "auth.errors.nameTooLong" })
      // The name is fixed here once and for all — there is no way to change it
      // afterwards — and it travels into the description of a calendar event on
      // every campaign-mate's Google Calendar. Google renders a subset of HTML
      // in that field, so a name shaped like a tag or an anchor would show
      // interpreted rather than literal in someone else's calendar. Restricting
      // the character set at the only point a name is set is the fix that holds
      // for the whole application; `buildDescription` escapes as well.
      .regex(SAFE_NAME_PATTERN, { error: "auth.errors.nameInvalidCharacters" }),
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

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
