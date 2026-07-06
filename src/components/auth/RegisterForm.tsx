"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslation } from "react-i18next";

import { register } from "@/app/(auth)/actions";
import AuthField from "@/components/auth/AuthField";
import SubmitButton from "@/components/auth/SubmitButton";
import type { AuthFormState } from "@/lib/validation/auth";

const INITIAL_STATE: AuthFormState = {};

/**
 * Registration form. Submits to the `register` server action via
 * `useActionState`, rendering translated field- and form-level errors.
 *
 * @returns {JSX.Element} The registration form.
 */
export default function RegisterForm() {
  const { t } = useTranslation();
  const [state, formAction, isPending] = useActionState(register, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AuthField
        id="name"
        name="name"
        type="text"
        label={t("auth.register.name")}
        autoComplete="name"
        required
        errorKey={state.fieldErrors?.name}
      />
      <AuthField
        id="email"
        name="email"
        type="email"
        label={t("auth.register.email")}
        autoComplete="email"
        required
        errorKey={state.fieldErrors?.email}
      />
      <AuthField
        id="password"
        name="password"
        type="password"
        label={t("auth.register.password")}
        autoComplete="new-password"
        required
        errorKey={state.fieldErrors?.password}
      />
      <AuthField
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label={t("auth.register.confirmPassword")}
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
        label={t("auth.register.submit")}
        pendingLabel={t("common.loading")}
        isPending={isPending}
      />

      <p className="text-center text-sm text-ink-muted">
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          {t("auth.register.loginLink")}
        </Link>
      </p>
    </form>
  );
}
