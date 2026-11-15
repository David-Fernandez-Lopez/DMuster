"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslation } from "react-i18next";

import { requestPasswordReset } from "@/app/(auth)/actions";
import AuthField from "@/components/auth/AuthField";
import SubmitButton from "@/components/auth/SubmitButton";
import type { AuthFormState } from "@/lib/validation/auth";

const INITIAL_STATE: AuthFormState = {};

/**
 * "Forgot password" form. After submitting it shows the same neutral
 * confirmation whether or not the address belongs to an account.
 *
 * @returns {JSX.Element} The form, or the confirmation once submitted.
 */
export default function ForgotPasswordForm() {
  const { t } = useTranslation();
  const [state, formAction, isPending] = useActionState(requestPasswordReset, INITIAL_STATE);

  if (state.sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-[var(--radius-control)] bg-s-soft px-3 py-2 text-sm text-s" role="status">
          {t("passwordReset.forgot.sent")}
        </p>
        <Link href="/login" className="text-center text-sm text-brand underline">
          {t("passwordReset.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{t("passwordReset.forgot.subtitle")}</p>
      <AuthField
        id="email"
        name="email"
        type="email"
        label={t("auth.login.email")}
        autoComplete="email"
        required
        errorKey={state.fieldErrors?.email}
      />

      {state.error ? (
        <p className="rounded-[var(--radius-control)] bg-n-soft px-3 py-2 text-sm text-n" role="alert">
          {t(state.error)}
        </p>
      ) : null}

      <SubmitButton
        label={t("passwordReset.forgot.submit")}
        pendingLabel={t("common.loading")}
        isPending={isPending}
      />
      <Link href="/login" className="text-center text-sm text-brand underline">
        {t("passwordReset.backToLogin")}
      </Link>
    </form>
  );
}
