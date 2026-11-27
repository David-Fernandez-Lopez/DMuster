"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import DiceEventFormModal from "@/components/dice/DiceEventFormModal";
import type { DiceEventKind } from "@/generated/prisma/enums";
import type { DiceEventCampaignContext } from "@/lib/diceEventService";

interface DiceTableAddButtonProps {
  /** The table's campaign (the form only needs that one). */
  campaign: DiceEventCampaignContext;
  /** Id of the signed-in user. */
  viewerId: string;
  /** "YYYY-MM-DD" of today. */
  today: string;
  /** The player of the column: preselected in the form. */
  userId: string;
  /** The player's name, for the accessible label. */
  playerName: string;
  /** The kind of the column: preselected in the form. */
  kind: DiceEventKind;
  /** The header pill, already rendered by the server table. */
  children: React.ReactNode;
}

/**
 * Wraps a column header of the table (the "Crítico n" or "Pifia n" pill) in a
 * button that opens the log form with that player and that kind already
 * chosen. The pill looks the same at rest; only the hover and focus ring tell
 * it can be pressed.
 *
 * @param {DiceTableAddButtonProps} props
 * @returns {JSX.Element}
 */
export default function DiceTableAddButton({
  campaign,
  viewerId,
  today,
  userId,
  playerName,
  kind,
  children,
}: DiceTableAddButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("diceEvents.addFor", {
          kind: t(`diceEvents.kind.${kind}`).toLowerCase(),
          player: playerName,
        })}
        className="block w-full cursor-pointer rounded-[var(--radius-control)] outline-none transition-shadow hover:ring-2 hover:ring-brand focus-visible:ring-2 focus-visible:ring-brand"
      >
        {children}
      </button>
      {open ? (
        <DiceEventFormModal
          campaigns={[campaign]}
          viewerId={viewerId}
          today={today}
          initialUserId={userId}
          initialKind={kind}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
