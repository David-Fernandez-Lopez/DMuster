"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import DiceEventFormModal from "@/components/dice/DiceEventFormModal";
import type { DiceEventCampaignContext } from "@/lib/diceEventService";

interface NewDiceEventButtonProps {
  /** Campaigns the user can log into. */
  campaigns: DiceEventCampaignContext[];
  /** Id of the signed-in user. */
  viewerId: string;
  /** "YYYY-MM-DD" of today. */
  today: string;
}

/**
 * Button that opens the "log a crit or fumble" form.
 *
 * @param {NewDiceEventButtonProps} props
 * @returns {JSX.Element}
 */
export default function NewDiceEventButton({ campaigns, viewerId, today }: NewDiceEventButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary min-h-[44px] px-4 text-sm font-semibold"
      >
        {t("diceEvents.add")}
      </button>
      {open ? (
        <DiceEventFormModal
          campaigns={campaigns}
          viewerId={viewerId}
          today={today}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
