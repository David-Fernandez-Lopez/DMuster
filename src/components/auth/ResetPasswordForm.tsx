"use client";

import { useActionState } from "react";
import { useTranslation } from "react-i18next";

import { resetPassword } from "@/app/(auth)/actions";
import AuthField from "@/components/auth/AuthField";
import SubmitButton from "@/components/auth/SubmitButton";
import type { AuthFormState } from "@/lib/validation/auth";

const INITIAL_STATE: AuthFormState = {};

/**
 * "Choose a new password" form. The raw token from the URL travels as a hidden
 * field; the server action validates it and redirects to the login page.
 *
 * @param {{ token: string }} props - Raw token from `/reset-password/[token]`.
 * @returns {JSX.Element} The form.
 */
export default function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, formAction, isPending] = useActionState(resetPassword, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <AuthField
        id="password"
        name="password"
        type="password"
        label={t("passwordReset.reset.password")}
        autoComplete="new-password"
        required
        errorKey={state.fieldErrors?.password}
      />
      <AuthField
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label={t("passwordReset.reset.confirmPassword")}
        autoComplete="new-password"
        required
        errorKey={state.fieldErrors?.confirmPassword}
      />

      {state.error ? (
        <p className="rounded-[var(--radius-control)] bg-n-soft px-3 py-2 text-sm text-n" role="alert">
          {t(state.error)}
        </p>
      ) : null}

      <SubmitButton
        label={t("passwordReset.reset.submit")}
        pendingLabel={t("common.loading")}
        isPending={isPending}
      />
    </form>
  );
}
