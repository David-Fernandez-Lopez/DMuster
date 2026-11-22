"use client";

import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { createCalendarFeed, regenerateCalendarFeed } from "@/app/(app)/profile/actions";
import { useCopyToClipboard } from "@/components/useCopyToClipboard";

/**
 * Settings row for the personal calendar subscription link. Without a link it
 * offers to generate one; with one it shows the URL to copy, a `webcal://`
 * shortcut for apps that handle it, and a two-step "generate a new link" that
 * revokes the old one.
 *
 * @param {{ initialUrl: string | null }} props - The user's current feed URL, or null if none yet.
 * @returns {JSX.Element} The calendar-feed row.
 */
export default function CalendarFeedSection({ initialUrl }: { initialUrl: string | null }) {
  const { t } = useTranslation();
  const inputId = useId();
  const { copyState, inputRef, copy, reset: resetCopyState } = useCopyToClipboard();

  const [url, setUrl] = useState<string | null>(initialUrl);
  const [isPending, setIsPending] = useState(false);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /**
   * Runs a create/regenerate action, then shows its URL or its error.
   *
   * @param {() => ReturnType<typeof createCalendarFeed>} action - The server action to run.
   */
  async function run(action: () => ReturnType<typeof createCalendarFeed>) {
    setIsPending(true);
    setErrorKey(null);
    try {
      const result = await action();
      if ("error" in result) {
        setErrorKey(result.error);
        return;
      }
      setUrl(result.url);
      setConfirmingRegenerate(false);
      resetCopyState();
    } catch {
      // A thrown action (network drop) must not fail silently.
      setErrorKey("profile.calendarFeed.errors.failed");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="py-3">
      <p className="font-medium text-ink">{t("profile.calendarFeed.title")}</p>
      <p className="mt-1 text-sm text-ink-muted">{t("profile.calendarFeed.description")}</p>

      {url === null ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(createCalendarFeed)}
          className="btn btn-secondary mt-3 min-h-[44px] px-4 text-sm font-semibold"
        >
          {t("profile.calendarFeed.generate")}
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <label htmlFor={inputId} className="text-sm font-medium text-ink">
            {t("profile.calendarFeed.urlLabel")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              ref={inputRef}
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-[44px] min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-3 text-sm text-ink"
            />
            <button
              type="button"
              onClick={() => copy(url)}
              className="btn btn-secondary min-h-[44px] shrink-0 px-4 text-sm font-semibold"
            >
              {copyState === "copied"
                ? t("profile.calendarFeed.copied")
                : t("profile.calendarFeed.copy")}
            </button>
          </div>
          {copyState === "manual" ? (
            <p role="status" className="text-sm text-ink-muted">
              {t("profile.calendarFeed.copyManual")}
            </p>
          ) : null}
          <p className="text-sm text-ink-muted">{t("profile.calendarFeed.secretHint")}</p>

          <a
            href={url.replace(/^https?:\/\//, "webcal://")}
            className="btn btn-secondary min-h-[44px] px-4 text-center text-sm font-semibold leading-[44px]"
          >
            {t("profile.calendarFeed.open")}
          </a>

          <details className="text-sm text-ink-muted">
            <summary className="cursor-pointer font-medium text-ink">
              {t("profile.calendarFeed.howTo.title")}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t("profile.calendarFeed.howTo.google")}</li>
              <li>{t("profile.calendarFeed.howTo.apple")}</li>
              <li>{t("profile.calendarFeed.howTo.outlook")}</li>
            </ul>
          </details>

          {confirmingRegenerate ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink">{t("profile.calendarFeed.regenerateConfirm")}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(regenerateCalendarFeed)}
                  className="btn btn-no btn-filled min-h-[44px] px-4 text-sm font-semibold"
                >
                  {t("profile.calendarFeed.regenerateYes")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRegenerate(false)}
                  className="btn btn-secondary min-h-[44px] px-4 text-sm font-semibold"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRegenerate(true)}
              className="btn btn-secondary min-h-[44px] self-start px-4 text-sm font-semibold"
            >
              {t("profile.calendarFeed.regenerate")}
            </button>
          )}
        </div>
      )}

      {errorKey ? (
        <p role="alert" className="mt-3 text-sm text-n">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
