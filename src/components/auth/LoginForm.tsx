"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslation } from "react-i18next";

import { login } from "@/app/(auth)/actions";
import AuthField from "@/components/auth/AuthField";
import SubmitButton from "@/components/auth/SubmitButton";
import type { AuthFormState } from "@/lib/validation/auth";

const INITIAL_STATE: AuthFormState = {};

/**
 * Login form. Submits to the `login` server action via `useActionState`,
 * rendering translated field- and form-level errors.
 *
 * @returns {JSX.Element} The login form.
 */
export default function LoginForm() {
  const { t } = useTranslation();
  const [state, formAction, isPending] = useActionState(login, INITIAL_STATE);

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

      <p className="text-center text-sm text-ink-muted">
        {t("auth.login.noAccount")}{" "}
        <Link href="/register" className="font-semibold text-brand hover:underline">
          {t("auth.login.registerLink")}
        </Link>
      </p>
    </form>
  );
}
