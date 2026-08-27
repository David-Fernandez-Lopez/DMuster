"use client";

import { useActionState, useState } from "react";
import { useTranslation } from "react-i18next";

import { changePassword } from "@/app/(app)/profile/actions";
import type { ProfileActionState } from "@/lib/validation/profile";

const INITIAL_STATE: ProfileActionState = {};

/**
 * Settings row for changing the account password, collapsed until asked for.
 *
 * The application had no way to change a password at all before this: the only
 * route to one was an `UPDATE` run by hand against the database, which also
 * left every live session untouched. Submitting here replaces the password and
 * ends every session the account holds, so the form warns that signing in again
 * is part of the flow rather than something going wrong.
 *
 * @returns {JSX.Element} The password change row.
 */
export default function ChangePasswordForm() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(changePassword, INITIAL_STATE);

  const fields = [
    { name: "currentPassword", labelKey: "profile.password.current", autoComplete: "current-password" },
    { name: "newPassword", labelKey: "profile.password.new", autoComplete: "new-password" },
    { name: "confirmPassword", labelKey: "profile.password.confirm", autoComplete: "new-password" },
  ];

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium text-ink">{t("profile.password.label")}</span>
        {open ? null : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn btn-secondary min-h-[44px] shrink-0 px-4 text-sm font-semibold"
          >
            {t("profile.password.change")}
          </button>
        )}
      </div>

      {open ? (
        <form action={formAction} className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-ink-muted">{t("profile.password.hint")}</p>

          {fields.map((field) => (
            <label key={field.name} className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">{t(field.labelKey)}</span>
              <input
                type="password"
                name={field.name}
                autoComplete={field.autoComplete}
                required
                className="min-h-[44px] rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-ink"
              />
              {state.fieldErrors?.[field.name] ? (
                <span className="text-sm text-n" role="alert">
                  {t(state.fieldErrors[field.name])}
                </span>
              ) : null}
            </label>
          ))}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="btn btn-primary min-h-[44px] px-4 text-sm font-semibold disabled:opacity-60"
            >
              {isPending ? t("common.loading") : t("profile.password.submit")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="btn btn-secondary min-h-[44px] px-4 text-sm font-semibold disabled:opacity-60"
            >
              {t("common.cancel")}
            </button>
          </div>

          {state.error ? (
            <p
              className="rounded-[var(--radius-control)] bg-n-soft px-3 py-2 text-sm text-n"
              role="alert"
            >
              {t(state.error)}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
