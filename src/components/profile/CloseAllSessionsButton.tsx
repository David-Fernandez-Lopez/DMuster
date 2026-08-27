"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { closeAllSessions } from "@/app/(app)/profile/actions";

/**
 * Settings row that signs the account out of every device at once, behind a
 * two-step confirmation.
 *
 * This is the application's answer to "someone else may be signed in as me".
 * There was none: sessions are database rows the app never listed and never
 * deleted, and a session that gets used now and then never actually expires, so
 * one obtained months ago still works. The only way to end one used to be an
 * operator running SQL.
 *
 * The confirmation exists because the current device goes with the rest — this
 * ends the session running the page.
 *
 * @returns {JSX.Element} The close-all-sessions row.
 */
export default function CloseAllSessionsButton() {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">{t("profile.sessions.label")}</p>
          <p className="mt-1 text-sm text-ink-muted">{t("profile.sessions.hint")}</p>
        </div>
        {confirming ? null : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn btn-secondary min-h-[44px] shrink-0 px-4 text-sm font-semibold"
          >
            {t("profile.sessions.closeAll")}
          </button>
        )}
      </div>

      {confirming ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm text-ink">{t("profile.sessions.confirm")}</p>
          <div className="flex items-center gap-2">
            <form action={closeAllSessions}>
              <button
                type="submit"
                className="btn btn-no btn-filled min-h-[44px] px-4 text-sm font-semibold"
              >
                {t("profile.sessions.confirmYes")}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn btn-secondary min-h-[44px] px-4 text-sm font-semibold"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
