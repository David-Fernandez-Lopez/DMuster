"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * DM control for adding an extra weekday holiday. A native date input (its value
 * is already "YYYY-MM-DD") plus an add button; on success the server-rendered
 * list refreshes and the input clears. A failed add — a weekend, a duplicate, or
 * an invalid date — surfaces the translated error returned by the API and keeps
 * the chosen date so it can be corrected.
 *
 * @returns {JSX.Element} The add-holiday form.
 */
export default function AddHolidayForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const inputId = useId();
  const [date, setDate] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /**
   * Posts the chosen date and, on success, refreshes the list and clears the
   * input. On failure it keeps the input and shows the translated error.
   *
   * @param {React.FormEvent<HTMLFormElement>} event - The submit event.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setErrorKey(null);

    try {
      const response = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "holidays.errors.unknown");
        return;
      }

      setDate("");
      router.refresh();
    } catch {
      setErrorKey("holidays.errors.unknown");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4"
    >
      <label
        htmlFor={inputId}
        className="block text-sm font-semibold text-ink"
      >
        {t("holidays.dateLabel")}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={inputId}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="min-h-[44px] flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink"
        />
        <button
          type="submit"
          disabled={isPending || date === ""}
          className="min-h-[44px] shrink-0 rounded-[var(--radius-control)] bg-brand px-4 text-sm font-semibold text-bg-elevated transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? t("common.loading") : t("holidays.add")}
        </button>
      </div>
      {errorKey ? (
        <p className="mt-3 text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </form>
  );
}
