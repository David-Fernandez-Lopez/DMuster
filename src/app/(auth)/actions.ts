"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/lib/auth";
import { acceptInvitation as acceptInvitationRequest } from "@/lib/invitationService";
import {
  type AuthFormState,
  firstFieldErrors,
  loginSchema,
} from "@/lib/validation/auth";
import { acceptInvitationSchema } from "@/lib/validation/invitation";

/** Where users land after a successful sign-in. */
const AFTER_AUTH_REDIRECT = "/";

/**
 * Authenticates a user from the login form. Validates with Zod, then delegates
 * to Auth.js `signIn`, which redirects on success (that redirect must be
 * re-thrown, not caught). Invalid credentials come back as an i18n error key.
 *
 * @param {AuthFormState} _prevState - Previous action state (unused).
 * @param {FormData} formData - Submitted login form.
 * @returns {Promise<AuthFormState>} Field/top-level errors, or never (redirects).
 */
export async function login(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: firstFieldErrors(z.flattenError(parsed.error).fieldErrors),
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: AFTER_AUTH_REDIRECT,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "auth.login.errors.invalidCredentials" };
    }
    // Re-throw the Next.js redirect signal thrown by a successful signIn.
    throw error;
  }

  return {};
}

/**
 * Signs the current user out (clearing the database session) and redirects to
 * the login page.
 */
export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

/**
 * Accepts a pending invitation from the `/invite/[token]` accept form and
 * immediately signs the new account in. The token travels as a hidden form
 * field (rendered read-only alongside it is the invitation's email, never
 * submitted — `acceptInvitationRequest` always uses the email tied to the
 * token). Field/top-level errors reuse `AuthFormState`, same shape as `login`.
 *
 * @param {AuthFormState} _prevState - Previous action state (unused).
 * @param {FormData} formData - Submitted accept form, including the hidden `token` field.
 * @returns {Promise<AuthFormState>} Field/top-level errors, or never (redirects).
 */
export async function acceptInvitation(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const parsed = acceptInvitationSchema.safeParse({
    name: formData.get("name"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: firstFieldErrors(z.flattenError(parsed.error).fieldErrors),
    };
  }

  const result = await acceptInvitationRequest({
    rawToken: token,
    name: parsed.data.name,
    password: parsed.data.password,
  });
  if (!result.ok) {
    return { error: result.error };
  }

  try {
    await signIn("credentials", {
      email: result.email,
      password: parsed.data.password,
      redirectTo: AFTER_AUTH_REDIRECT,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "invitations.errors.unknown" };
    }
    // Re-throw the Next.js redirect signal thrown by a successful signIn.
    throw error;
  }

  return {};
}

/**
 * Signs the current user out and sends them back to the same invitation link,
 * so a visitor who opens `/invite/[token]` while already signed in as someone
 * else can sign out and accept it without losing the link. The redirect
 * target is built server-side from the token (a hidden form field, like
 * `acceptInvitation`) rather than trusted as a raw URL, so it stays
 * structurally same-origin.
 *
 * @param {FormData} formData - Submitted form, carrying the hidden `token` field.
 */
export async function logoutToInvitation(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  await signOut({ redirectTo: `/invite/${encodeURIComponent(token)}` });
}
