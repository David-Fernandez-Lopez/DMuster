"use client";

import { useActionState } from "react";
import { useTranslation } from "react-i18next";

import { acceptInvitation } from "@/app/(auth)/actions";
import AuthField from "@/components/auth/AuthField";
import SubmitButton from "@/components/auth/SubmitButton";
import type { AuthFormState } from "@/lib/validation/auth";

const INITIAL_STATE: AuthFormState = {};

interface AcceptInviteFormProps {
  /** Raw token from the `/invite/[token]` URL, carried as a hidden field. */
  token: string;
  /** The invitation's fixed email, shown read-only and never submitted. */
  email: string;
}

/**
 * Invitation accept form: same fields as registration minus a writable
 * email — the email is fixed by the invitation and rendered read-only.
 * Submits the `acceptInvitation` server action via `useActionState`, which
 * creates the account (using the token's own email) and signs it in.
 *
 * @param {AcceptInviteFormProps} props - The invitation's token and fixed email.
 * @returns {JSX.Element} The accept form.
 */
export default function AcceptInviteForm({ token, email }: AcceptInviteFormProps) {
  const { t } = useTranslation();
  const [state, formAction, isPending] = useActionState(acceptInvitation, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <AuthField
        id="email"
        name="emailDisplay"
        type="email"
        label={t("invitations.accept.emailLabel")}
        defaultValue={email}
        readOnly
      />
      <AuthField
        id="name"
        name="name"
        type="text"
        label={t("invitations.accept.nameLabel")}
        autoComplete="name"
        required
        errorKey={state.fieldErrors?.name}
      />
      <AuthField
        id="password"
        name="password"
        type="password"
        label={t("invitations.accept.passwordLabel")}
        autoComplete="new-password"
        required
        errorKey={state.fieldErrors?.password}
      />
      <AuthField
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label={t("invitations.accept.confirmPasswordLabel")}
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
        label={t("invitations.accept.submit")}
        pendingLabel={t("common.loading")}
        isPending={isPending}
      />
    </form>
  );
}
