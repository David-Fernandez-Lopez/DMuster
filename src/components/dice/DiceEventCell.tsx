"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import FiltersModal from "@/components/calendar/FiltersModal";
import DiceEventFormModal from "@/components/dice/DiceEventFormModal";
import DiceEventItemActions from "@/components/dice/DiceEventItemActions";
import DiceKindBadge from "@/components/dice/DiceKindBadge";
import type { DiceEventRow, DiceEventCampaignContext } from "@/lib/diceEventService";

interface DiceEventCellProps {
  /** The entry this cell shows. */
  entry: DiceEventRow;
  /** Its skill or condition name in the user's language, with the detail if any. */
  label: string;
  /** The entry's campaign (the edit form only needs that one). */
  campaign: DiceEventCampaignContext;
  /** Id of the signed-in user. */
  viewerId: string;
  /** "YYYY-MM-DD" of today. */
  today: string;
  /** The entry's date and time already formatted for the user's locale. */
  whenLabel: string;
  /** The entry's arc already translated, or `null` when it has none. */
  arcLabel: string | null;
}

/**
 * One cell of the table: the skill, as a button. Opening it shows the entry's
 * date, time, arc and author with Edit and Delete (any member may use both);
 * Edit swaps that dialog for the form. Keeps the cell itself as bare as the
 * Excel's, with the detail one tap away.
 *
 * @param {DiceEventCellProps} props
 * @returns {JSX.Element}
 */
export default function DiceEventCell({
  entry,
  label,
  campaign,
  viewerId,
  today,
  whenLabel,
  arcLabel,
}: DiceEventCellProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"closed" | "detail" | "edit">("closed");

  return (
    <>
      <button
        type="button"
        onClick={() => setMode("detail")}
        title={whenLabel}
        className="w-full rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[13px] font-semibold text-ink hover:bg-brand-soft"
      >
        {label}
      </button>

      {mode === "detail" ? (
        <FiltersModal title={label} onClose={() => setMode("closed")}>
          <div className="flex flex-col gap-2">
            <div>
              <DiceKindBadge kind={entry.kind} label={t(`diceEvents.kind.${entry.kind}`)} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-ink-muted">{t("diceEvents.form.player")}</dt>
              <dd className="font-semibold text-ink">{entry.userName}</dd>
              <dt className="text-ink-muted">{t("diceEvents.cell.type")}</dt>
              <dd className="text-ink">{t(`diceEvents.category.${entry.skill.category}`)}</dd>
              <dt className="text-ink-muted">{t("diceEvents.cell.when")}</dt>
              <dd className="text-ink">{whenLabel}</dd>
              {arcLabel ? (
                <>
                  <dt className="text-ink-muted">{t("diceEvents.form.arc")}</dt>
                  <dd className="text-ink">{arcLabel}</dd>
                </>
              ) : null}
              <dt className="text-ink-muted">{t("diceEvents.cell.loggedBy")}</dt>
              <dd className="text-ink">{entry.createdByName}</dd>
            </dl>
            <DiceEventItemActions
              event={{
                id: entry.id,
                campaignId: entry.campaignId,
                userId: entry.userId,
                kind: entry.kind,
                skill: entry.skill,
                detail: entry.detail,
                date: entry.date,
                time: entry.time,
                arcId: entry.arc?.id ?? null,
                sessionId: entry.sessionId,
              }}
              campaign={campaign}
              viewerId={viewerId}
              today={today}
              onEdit={() => setMode("edit")}
            />
          </div>
        </FiltersModal>
      ) : null}

      {mode === "edit" ? (
        <DiceEventFormModal
          campaigns={[campaign]}
          viewerId={viewerId}
          today={today}
          event={{
            id: entry.id,
            campaignId: entry.campaignId,
            userId: entry.userId,
            kind: entry.kind,
            skill: entry.skill,
            detail: entry.detail,
            date: entry.date,
            time: entry.time,
            arcId: entry.arc?.id ?? null,
            sessionId: entry.sessionId,
          }}
          onClose={() => setMode("closed")}
        />
      ) : null}
    </>
  );
}
