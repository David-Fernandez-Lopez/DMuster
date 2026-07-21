"use client";

import { useTranslation } from "react-i18next";

import AvailabilityToggle, {
  type ResponseStatus,
} from "@/components/availability/AvailabilityToggle";
import { toUtcDate } from "@/lib/date";

interface AvailabilityDayCardProps {
  /** The eligible day this card answers, "YYYY-MM-DD". */
  date: string;
  /** Tags of the campaigns the response affects (the user's campaigns). */
  tags: string[];
  /** The user's current stored response for the day, or `null` when pending. */
  initialStatus: ResponseStatus;
  /** Forwarded to the toggle; notifies the list once a change is persisted. */
  onPersisted: (date: string, status: ResponseStatus) => void;
}

/**
 * A single day in the "Mi disponibilidad" list: the long localized date, the
 * campaigns the response affects, and the Sí/No toggle. The response is global
 * per day, so the "Afecta a" line lists every campaign the player belongs to
 * (omitted when they have none). Dates are formatted in UTC because they are
 * stored at UTC midnight, so the rendered day never shifts with the timezone.
 *
 * @param {AvailabilityDayCardProps} props - The day, affected tags, current
 *   status, and the list's persisted callback.
 * @returns {JSX.Element} The availability day card.
 */
export default function AvailabilityDayCard({
  date,
  tags,
  initialStatus,
  onPersisted,
}: AvailabilityDayCardProps) {
  const { t, i18n } = useTranslation();

  const longDate = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(date));

  return (
    <li className="rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4">
      <p className="font-semibold text-ink first-letter:uppercase">{longDate}</p>
      {tags.length > 0 ? (
        <p className="mt-1 text-sm text-ink-muted">
          {t("availability.affects", { tags: tags.join(", ") })}
        </p>
      ) : null}
      <div className="mt-3">
        <AvailabilityToggle
          date={date}
          initialStatus={initialStatus}
          onPersisted={onPersisted}
        />
      </div>
    </li>
  );
}
