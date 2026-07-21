"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import AvailabilityDayCard from "@/components/availability/AvailabilityDayCard";
import {
  type ResponseStatus,
} from "@/components/availability/AvailabilityToggle";
import ResponderFilter, {
  type ResponderFilterValue,
} from "@/components/availability/ResponderFilter";

interface AvailabilityListProps {
  /** Upcoming eligible days to show, ascending ("YYYY-MM-DD"). */
  days: string[];
  /** The user's stored responses in range, keyed by day. */
  initialResponses: Record<string, "YES" | "NO" | "MAYBE">;
  /** Tags of the user's campaigns (the "Afecta a" line on each card). */
  tags: string[];
}

/**
 * Client owner of the "Mi disponibilidad" list. Holds the Pendientes/Todas
 * filter and a live map of answered days so a card can leave the "Pendientes"
 * view the moment its response is persisted, without a server refetch. Each
 * card's toggle owns its own optimistic state; this component only tracks which
 * days are answered so the filter and empty state stay correct.
 *
 * @param {AvailabilityListProps} props - The days, the user's current
 *   responses, and the campaign tags.
 * @returns {JSX.Element} The filtered list of availability day cards.
 */
export default function AvailabilityList({
  days,
  initialResponses,
  tags,
}: AvailabilityListProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ResponderFilterValue>("pending");
  const [responses, setResponses] =
    useState<Record<string, "YES" | "NO" | "MAYBE">>(initialResponses);

  /**
   * Reconciles the answered-days map after a card persists a change: a YES/NO
   * records the day as answered; clearing (`null`) drops it back to pending.
   *
   * @param {string} date - The day that changed, "YYYY-MM-DD".
   * @param {ResponseStatus} status - The persisted status, or `null` if cleared.
   */
  function handlePersisted(date: string, status: ResponseStatus) {
    setResponses((current) => {
      const next = { ...current };
      if (status === null) {
        delete next[date];
      } else {
        next[date] = status;
      }
      return next;
    });
  }

  const visibleDays =
    filter === "pending" ? days.filter((day) => !(day in responses)) : days;

  return (
    <div className="mt-6">
      <ResponderFilter value={filter} onChange={setFilter} />

      {visibleDays.length === 0 ? (
        <p className="mt-6 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-6 text-center text-sm text-ink-muted">
          {t("availability.allDone")}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {visibleDays.map((day) => (
            <AvailabilityDayCard
              key={day}
              date={day}
              tags={tags}
              initialStatus={initialResponses[day] ?? null}
              onPersisted={handlePersisted}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
