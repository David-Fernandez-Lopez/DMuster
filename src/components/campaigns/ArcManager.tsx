"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { CampaignArcRow } from "@/lib/campaignArcService";
import { ARC_NAME_MAX_LENGTH } from "@/lib/validation/diceEvent";

interface ArcManagerProps {
  campaignId: string;
  arcs: CampaignArcRow[];
}

/**
 * DM card to manage a campaign's arcs: add the next one, rename one, or delete
 * one (its log entries stay, without an arc). Each action goes through the arcs
 * API and refreshes the server-rendered page; a failure shows the translated
 * error under the card.
 *
 * @param {ArcManagerProps} props
 * @returns {JSX.Element}
 */
export default function ArcManager({ campaignId, arcs }: ArcManagerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(arcs.map((arc) => [arc.id, arc.name ?? ""])),
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /**
   * Runs one arcs API call and refreshes on success.
   *
   * @param {string} url - Endpoint.
   * @param {"POST" | "PUT" | "DELETE"} method - HTTP method.
   * @param {unknown} [body] - JSON body, when the call has one.
   * @returns {Promise<boolean>} Whether it succeeded.
   */
  async function call(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<boolean> {
    setIsPending(true);
    setErrorKey(null);
    try {
      const response = await fetch(url, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setErrorKey(data?.error ?? "arcs.errors.unknown");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErrorKey("arcs.errors.unknown");
      return false;
    } finally {
      setIsPending(false);
    }
  }

  const inputClass =
    "min-h-[44px] min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink outline-none focus:border-brand";

  return (
    <section className="mt-8 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4">
      <h2 className="font-display text-xl font-semibold text-ink">{t("arcs.title")}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t("arcs.description")}</p>

      {arcs.length === 0 ? <p className="mt-4 text-sm text-ink-muted">{t("arcs.empty")}</p> : null}

      <ul className="mt-4 flex flex-col gap-4">
        {arcs.map((arc) => (
          <li key={arc.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">{t("diceEvents.arcLabel", { number: arc.number })}</span>
              <span className="text-xs text-ink-muted">{t("arcs.entries", { count: arc.eventCount })}</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label={t("arcs.nameLabel")}
                placeholder={t("arcs.namePlaceholder")}
                maxLength={ARC_NAME_MAX_LENGTH}
                value={names[arc.id] ?? ""}
                onChange={(e) => setNames((prev) => ({ ...prev, [arc.id]: e.target.value }))}
                className={inputClass}
              />
              <button
                type="button"
                disabled={isPending || (names[arc.id] ?? "") === (arc.name ?? "")}
                onClick={() =>
                  call(`/api/campaigns/${campaignId}/arcs/${arc.id}`, "PUT", { name: names[arc.id] ?? "" })
                }
                className="btn btn-secondary min-h-[44px] shrink-0 px-3 text-sm font-semibold disabled:opacity-60"
              >
                {t("arcs.save")}
              </button>
            </div>
            {confirmingId === arc.id ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink">{t("arcs.confirmDelete")}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={async () => {
                      if (await call(`/api/campaigns/${campaignId}/arcs/${arc.id}`, "DELETE")) {
                        setConfirmingId(null);
                      }
                    }}
                    className="btn btn-no btn-filled min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
                  >
                    {isPending ? t("common.loading") : t("arcs.confirmYes")}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setConfirmingId(null)}
                    className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingId(arc.id)}
                className="btn btn-no min-h-[44px] self-start px-3 text-sm font-semibold"
              >
                {t("arcs.delete")}
              </button>
            )}
          </li>
        ))}
      </ul>

      <form
        className="mt-5 flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await call(`/api/campaigns/${campaignId}/arcs`, "POST", { name: newName })) {
            setNewName("");
          }
        }}
      >
        <input
          type="text"
          aria-label={t("arcs.nameLabel")}
          placeholder={t("arcs.namePlaceholder")}
          maxLength={ARC_NAME_MAX_LENGTH}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={isPending}
          className="btn btn-primary min-h-[44px] shrink-0 px-3 text-sm font-semibold disabled:opacity-60"
        >
          {t("arcs.add")}
        </button>
      </form>

      {errorKey ? (
        <p className="mt-3 text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </section>
  );
}
