"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

// Type-only, so nothing from the service (Prisma, env) is pulled into the
// client bundle. It used to be declared here as well as there, two copies of
// one shape with nothing keeping them in step — which is how a field added to
// the service went unnoticed here.
import type { GoogleConnectionStatus } from "@/lib/google/connectionService";

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
  const [warningKeys, setWarningKeys] = useState<string[]>([]);

  /**
   * Shared fetch + error + refresh idiom for every mutation below.
   *
   * @param {RequestInfo} input - The fetch URL.
   * @param {RequestInit} [init] - The fetch options.
   * @returns {Promise<Record<string, unknown> | null>} The response's `data`
   *   payload on success, or null when the call failed.
   */
  async function callApi(
    input: RequestInfo,
    init?: RequestInit,
  ): Promise<Record<string, unknown> | null> {
    setIsPending(true);
    setErrorKey(null);
    try {
      const response = await fetch(input, init);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErrorKey(body?.error ?? "integrations.google.errors.unknown");
        return null;
      }
      router.refresh();
      return (body?.data as Record<string, unknown> | undefined) ?? {};
    } catch {
      setErrorKey("integrations.google.errors.unknown");
      return null;
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

  /**
   * Disconnects, then reports what the server could not finish.
   *
   * Both leftovers below are things only the person can resolve, from their own
   * Google account — so staying silent about them was the same as never having
   * tried. The disconnect itself still counts as done either way: the app has
   * let go of the connection regardless.
   */
  async function handleDisconnect(): Promise<void> {
    const data = await callApi("/api/integrations/google", { method: "DELETE" });
    if (!data) {
      return;
    }

    const warnings: string[] = [];
    if (data.revokedAtGoogle === false) {
      warnings.push("integrations.google.warnings.notRevokedAtGoogle");
    }
    if (data.calendarCleanupFailed === true) {
      warnings.push("integrations.google.warnings.calendarCleanupFailed");
    }

    setWarningKeys(warnings);
    setDisconnectConfirming(false);
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

  // Survives the disconnect: once `status.connected` flips to false the whole
  // branch below changes, and these are exactly the messages the person needs
  // at that moment.
  const warnings = warningKeys.length > 0 ? (
    <div className="mt-2 flex flex-col gap-2">
      {warningKeys.map((key) => (
        <p
          key={key}
          className="rounded-[var(--radius-control)] bg-t-soft px-3 py-2 text-sm text-t"
          role="alert"
        >
          {t(key)}
        </p>
      ))}
    </div>
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
        {warnings}
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

      {/* Whether the scheduled sweep is alive at all. A cron whose secret stops
          matching produces no error anyone sees — it just stops, and the only
          symptom is sync quietly not happening. This is the line that would
          show it. */}
      {status.cronConfigured ? (
        <p className={`mt-2 text-xs ${status.lastCronSuccessAt ? "text-ink-muted" : "text-n"}`}>
          {status.lastCronSuccessAt
            ? t("integrations.google.lastCronRun", {
                date: new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(status.lastCronSuccessAt),
              })
            : t("integrations.google.cronNeverRan")}
        </p>
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
      {warnings}
    </div>
  );
}
