"use client";

import { useActionState } from "react";
import { useTranslation } from "react-i18next";

import { updateLocale } from "@/app/(app)/profile/actions";
import { LOCALES } from "@/i18n/settings";
import type { ProfileActionState } from "@/lib/validation/profile";

const INITIAL_STATE: ProfileActionState = {};

/**
 * Settings row with an ES/EN segmented control. Submits the chosen locale to
 * the `updateLocale` server action, which persists it and revalidates the
 * layout — flipping the whole UI language (and this control's active segment,
 * driven by the i18n instance) in the same roundtrip.
 *
 * @returns {JSX.Element} The language selector row.
 */
export default function LocaleSelector() {
  const { t, i18n } = useTranslation();
  const [state, formAction, isPending] = useActionState(
    updateLocale,
    INITIAL_STATE,
  );
  const active = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium text-ink">{t("profile.language.label")}</span>
        <form action={formAction}>
          <div
            role="group"
            aria-label={t("profile.language.label")}
            className="inline-flex overflow-hidden rounded-[var(--radius-control)] border border-border"
          >
            {LOCALES.map((locale) => {
              const isActive = active === locale;
              return (
                <button
                  key={locale}
                  type="submit"
                  name="locale"
                  value={locale}
                  disabled={isPending}
                  aria-pressed={isActive}
                  className={`min-h-[44px] px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${
                    isActive
                      ? "bg-brand text-bg-elevated"
                      : "text-ink hover:bg-brand-soft"
                  }`}
                >
                  {t(`profile.language.${locale}`)}
                </button>
              );
            })}
          </div>
        </form>
      </div>

      {state.error ? (
        <p
          className="mt-2 rounded-[var(--radius-control)] bg-n-soft px-3 py-2 text-sm text-n"
          role="alert"
        >
          {t(state.error)}
        </p>
      ) : null}
    </div>
  );
}
