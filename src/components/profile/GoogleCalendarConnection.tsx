"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** The profile's Google Calendar section state, one shape per rendered case. */
export type GoogleConnectionStatus =
  | { configured: false }
  | { configured: true; connected: false }
  | {
      configured: true;
      connected: true;
      googleEmail: string | null;
      enabled: boolean;
      brokenAt: Date | null;
      pendingCount: number;
      failedCount: number;
      lastSyncAt: Date | null;
    };

interface GoogleCalendarConnectionProps {
  status: GoogleConnectionStatus;
  /** Outcome of a just-completed OAuth round trip (`?google=...`), shown once as a banner. */
  callbackOutcome?: "connected" | "already_linked" | "error" | null;
}

/**
 * Profile settings row for the Google Calendar integration (roadmap #23).
 * Renders nothing when the deployment never configured Google OAuth; a
 * "Conectar" link when configured but not connected; an enabled/paused
 * segmented control, a sync summary and a two-step disconnect when connected;
 * and a reconnect prompt when the connection is marked broken. Every mutation
 * goes through `fetch` + `router.refresh()` (mirrors `CancelSessionButton`),
 * so the server-computed `status` prop is always the source of truth after an
 * action completes — there is no client-side state to reconcile.
 *
 * @param {GoogleCalendarConnectionProps} props - Server-resolved connection status.
 * @returns {JSX.Element | null} The settings row, or null when unconfigured.
 */
export default function GoogleCalendarConnection({
  status,
  callbackOutcome,
}: GoogleCalendarConnectionProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [disconnectConfirming, setDisconnectConfirming] = useState(false);

  /**
   * Shared fetch + error + refresh idiom for every mutation below.
   *
   * @param {RequestInfo} input - The fetch URL.
   * @param {RequestInit} [init] - The fetch options.
   * @returns {Promise<boolean>} Whether the call succeeded.
   */
  async function callApi(input: RequestInfo, init?: RequestInit): Promise<boolean> {
    setIsPending(true);
    setErrorKey(null);
    try {
      const response = await fetch(input, init);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "integrations.google.errors.unknown");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErrorKey("integrations.google.errors.unknown");
      return false;
    } finally {
      setIsPending(false);
    }
  }

  async function handleToggle(enabled: boolean): Promise<void> {
    if (status.configured && status.connected && status.enabled === enabled) {
      return;
    }
    await callApi("/api/integrations/google/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  async function handleRetry(): Promise<void> {
    await callApi("/api/integrations/google/retry", { method: "POST" });
  }

  async function handleDisconnect(): Promise<void> {
    const ok = await callApi("/api/integrations/google", { method: "DELETE" });
    if (ok) {
      setDisconnectConfirming(false);
    }
  }

  if (!status.configured) {
    return null;
  }

  const bannerKey =
    callbackOutcome === "connected"
      ? "integrations.google.connectedNotice"
      : callbackOutcome === "already_linked"
        ? "integrations.google.errors.alreadyLinked"
        : callbackOutcome === "error"
          ? "integrations.google.errors.exchange"
          : null;
  const banner = bannerKey ? (
    <p
      className={`mt-2 rounded-[var(--radius-control)] px-3 py-2 text-sm ${
        callbackOutcome === "connected" ? "bg-s-soft text-s" : "bg-n-soft text-n"
      }`}
      role="status"
    >
      {t(bannerKey)}
    </p>
  ) : null;

  if (!status.connected) {
    return (
      <div className="py-3">
        <p className="font-medium text-ink">{t("integrations.google.title")}</p>
        <p className="mt-1 text-sm text-ink-muted">{t("integrations.google.description")}</p>
        <a
          href="/api/integrations/google/connect"
          className="btn btn-primary mt-3 inline-flex min-h-[44px] items-center px-4 text-sm font-semibold"
        >
          {t("integrations.google.connect")}
        </a>
        {banner}
      </div>
    );
  }

  const lastSyncLabel = status.lastSyncAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
        status.lastSyncAt,
      )
    : null;

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">{t("integrations.google.title")}</p>
          {status.googleEmail ? (
            <p className="mt-1 truncate text-sm text-ink-muted">
              {t("integrations.google.connectedAs", { email: status.googleEmail })}
            </p>
          ) : null}
        </div>
        <div
          role="group"
          aria-label={t("integrations.google.title")}
          className="inline-flex shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-border"
        >
          <button
            type="button"
            aria-pressed={status.enabled}
            disabled={isPending}
            onClick={() => handleToggle(true)}
            className={`min-h-[44px] px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${
              status.enabled ? "bg-brand text-bg-elevated" : "text-ink hover:bg-brand-soft"
            }`}
          >
            {t("integrations.google.enable")}
          </button>
          <button
            type="button"
            aria-pressed={!status.enabled}
            disabled={isPending}
            onClick={() => handleToggle(false)}
            className={`min-h-[44px] px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${
              !status.enabled ? "bg-brand text-bg-elevated" : "text-ink hover:bg-brand-soft"
            }`}
          >
            {t("integrations.google.paused")}
          </button>
        </div>
      </div>

      {status.brokenAt ? (
        <div className="mt-2 flex flex-col items-start gap-2 rounded-[var(--radius-control)] bg-t-soft px-3 py-2 text-sm text-t">
          <p>{t("integrations.google.broken")}</p>
          <a
            href="/api/integrations/google/connect"
            className="btn btn-primary min-h-[44px] px-4 text-sm font-semibold"
          >
            {t("integrations.google.reconnect")}
          </a>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          {lastSyncLabel
            ? t("integrations.google.lastSync", { date: lastSyncLabel })
            : t("integrations.google.neverSynced")}
        </p>
      )}

      {status.pendingCount > 0 ? (
        <p className="mt-1 text-sm text-t">
          {t("integrations.google.pendingSummary", { count: status.pendingCount })}
        </p>
      ) : null}

      {status.failedCount > 0 ? (
        <p className="mt-1 text-sm text-n">
          {t("integrations.google.failedSummary", { count: status.failedCount })}
        </p>
      ) : null}

      {status.pendingCount + status.failedCount > 0 ? (
        <button
          type="button"
          onClick={handleRetry}
          disabled={isPending}
          className="btn btn-secondary mt-1 min-h-[36px] px-3 text-xs font-semibold disabled:opacity-60"
        >
          {isPending ? t("common.loading") : t("integrations.google.retry")}
        </button>
      ) : null}

      <div className="mt-3">
        {!disconnectConfirming ? (
          <button
            type="button"
            onClick={() => setDisconnectConfirming(true)}
            className="btn btn-no min-h-[44px] w-full text-sm font-semibold"
          >
            {t("integrations.google.disconnect")}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink">{t("integrations.google.disconnectPrompt")}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isPending}
                className="btn btn-no btn-filled min-h-[44px] flex-1 text-sm font-semibold disabled:opacity-60"
              >
                {isPending ? t("common.loading") : t("integrations.google.disconnectYes")}
              </button>
              <button
                type="button"
                onClick={() => setDisconnectConfirming(false)}
                disabled={isPending}
                className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>

      {errorKey ? (
        <p className="mt-2 text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}

      {banner}
    </div>
  );
}
