"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/lib/auth";
import { registerUser } from "@/lib/userService";
import {
  type AuthFormState,
  firstFieldErrors,
  loginSchema,
  registerSchema,
} from "@/lib/validation/auth";

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
 * Registers a new user from the sign-up form and immediately signs them in.
 * Validates with Zod; a duplicate email surfaces on the email field.
 *
 * @param {AuthFormState} _prevState - Previous action state (unused).
 * @param {FormData} formData - Submitted registration form.
 * @returns {Promise<AuthFormState>} Field/top-level errors, or never (redirects).
 */
export async function register(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: firstFieldErrors(z.flattenError(parsed.error).fieldErrors),
    };
  }

  const result = await registerUser(parsed.data);
  if (!result.ok) {
    if (result.error === "auth.errors.emailTaken") {
      return { fieldErrors: { email: result.error } };
    }
    return { error: result.error };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: AFTER_AUTH_REDIRECT,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "auth.errors.unknown" };
    }
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
