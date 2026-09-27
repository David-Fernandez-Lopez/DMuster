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
import { groupDaysByMonth, toUtcDate } from "@/lib/date";
import type { ResponseStatus as StoredResponseStatus } from "@/lib/viability";

interface AvailabilityListProps {
  /** Upcoming eligible days to show, ascending ("YYYY-MM-DD"). */
  days: string[];
  /** The user's stored responses in range, keyed by day. */
  initialResponses: Record<string, StoredResponseStatus>;
  /** Tags of the user's campaigns (the "Afecta a" line on each card). */
  tags: string[];
}

/**
 * Client owner of the "Mi disponibilidad" list. Holds the Pendientes/Todas
 * filter and a live map of answered days so a card can leave the "Pendientes"
 * view the moment its response is persisted, without a server refetch. Cards
 * are grouped into one section per month, each rendering its own grid, so the
 * list makes better use of the width on desktop while staying a single column
 * on mobile.
 *
 * That map — not the server-rendered prop it starts from — is what seeds each
 * card. Answering a day removes it from the "Pendientes" list, which unmounts
 * its card; coming back via "Todas" mounts a fresh one, and a toggle takes its
 * initial value once, at mount. Seeding from the original prop showed the
 * answer as it was *before* this session's changes, contradicting the database.
 * Re-tapping the answer a toggle displays clears it, so a stale display turns
 * "confirm what I chose" into "delete what I chose" — a day silently back to
 * pending, which every campaign then reads as an unresolved "T".
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
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<ResponderFilterValue>("pending");
  const [responses, setResponses] =
    useState<Record<string, StoredResponseStatus>>(initialResponses);

  /**
   * Reconciles the answered-days map after a card persists a change: any stored
   * answer records the day as answered; clearing (`null`) drops it back to pending.
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
  const monthGroups = groupDaysByMonth(visibleDays);

  return (
    <div className="mt-6">
      <ResponderFilter value={filter} onChange={setFilter} />

      {visibleDays.length === 0 ? (
        <p className="mt-6 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-6 text-center text-sm text-ink-muted">
          {t("availability.allDone")}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {monthGroups.map((group) => {
            const monthLabel = new Intl.DateTimeFormat(i18n.language, {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(toUtcDate(`${group.month}-01`));
            const capitalizedLabel =
              monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

            return (
              <section key={group.month} aria-labelledby={`month-${group.month}`}>
                <h2
                  id={`month-${group.month}`}
                  className="font-display text-lg font-semibold text-ink"
                >
                  {capitalizedLabel}
                </h2>
                <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {group.days.map((day) => (
                    <AvailabilityDayCard
                      key={day}
                      date={day}
                      tags={tags}
                      initialStatus={responses[day] ?? null}
                      onPersisted={handlePersisted}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
