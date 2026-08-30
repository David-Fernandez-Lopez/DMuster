"use client";

import { useActionState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { login } from "@/app/(auth)/actions";
import AuthField from "@/components/auth/AuthField";
import SubmitButton from "@/components/auth/SubmitButton";
import { forgetStoredSelection } from "@/lib/calendarFilterStorage";
import type { AuthFormState } from "@/lib/validation/auth";

const INITIAL_STATE: AuthFormState = {};

/**
 * Login form. Submits to the `login` server action via `useActionState`,
 * rendering translated field- and form-level errors.
 *
 * Also drops the calendar filters saved in `localStorage`. They hold campaign
 * ids and master user ids belonging to whoever was last signed in, and nothing
 * was removing them — on a shared browser the next person inherited a calendar
 * quietly filtered by someone else's choices, over someone else's campaigns.
 *
 * Done here rather than on the way out because signing out is a server action,
 * which cannot reach `localStorage` at all — and because this covers every path
 * to a signed-out state, not just the button: an expired session, a revoked
 * account, a cleared cookie. Anyone looking at this form is not signed in.
 *
 * @returns {JSX.Element} The login form.
 */
export default function LoginForm() {
  const { t } = useTranslation();
  const [state, formAction, isPending] = useActionState(login, INITIAL_STATE);

  useEffect(() => {
    forgetStoredSelection();
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AuthField
        id="email"
        name="email"
        type="email"
        label={t("auth.login.email")}
        autoComplete="email"
        required
        errorKey={state.fieldErrors?.email}
      />
      <AuthField
        id="password"
        name="password"
        type="password"
        label={t("auth.login.password")}
        autoComplete="current-password"
        required
        errorKey={state.fieldErrors?.password}
      />

      {state.error ? (
        <p className="rounded-[var(--radius-control)] bg-n-soft px-3 py-2 text-sm text-n" role="alert">
          {t(state.error)}
        </p>
      ) : null}

      <SubmitButton
        label={t("auth.login.submit")}
        pendingLabel={t("common.loading")}
        isPending={isPending}
      />
    </form>
  );
}
