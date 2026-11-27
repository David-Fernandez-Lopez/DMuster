"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import FiltersModal from "@/components/calendar/FiltersModal";
import DiceKindIcon from "@/components/dice/DiceKindIcon";
import SkillCombobox from "@/components/dice/SkillCombobox";
import type { DiceEventKind } from "@/generated/prisma/enums";
import { DICE_SKILL_MAX_LENGTH } from "@/lib/diceSkill";
import type { DiceEventCampaignContext, DiceEventSkill } from "@/lib/diceEventService";

/** The editable fields of an entry, as the form holds them. */
export type DiceEventFormValues = {
  id: string;
  campaignId: string;
  userId: string;
  kind: DiceEventKind;
  /** The catalogue entry (the whole object, so a deactivated one can still be listed). */
  skill: DiceEventSkill;
  detail: string | null;
  date: string;
  time: string | null;
  arcId: string | null;
  sessionId: string | null;
};

interface DiceEventFormModalProps {
  /** Campaigns the user can log into (one when the page is scoped to a campaign). */
  campaigns: DiceEventCampaignContext[];
  /** Id of the signed-in user: the default player. */
  viewerId: string;
  /** "YYYY-MM-DD" of today: the latest date an edit may set. */
  today: string;
  /** The entry being edited; omit to create a new one. */
  event?: DiceEventFormValues;
  /** Create mode: player to preselect (ignored if they are not a selectable member). */
  initialUserId?: string;
  /** Create mode: kind to preselect. */
  initialKind?: DiceEventKind;
  /** Called on any close path. */
  onClose: () => void;
}

const KINDS: DiceEventKind[] = ["CRITICAL", "FUMBLE"];

/**
 * Modal form to log a critical or fumble, or to edit one. Any member may log
 * for any member of the campaign. What was rolled is picked from the closed
 * catalogue of the campaign's role system (skills, attributes and conditions in
 * three groups), with a free "detail" only for entries that allow it (a Lore), and
 * mandatory for the "Custom" ones. A
 * campaign without a system cannot log anything, so the form says so instead.
 * The date and time are not asked when logging (the server stamps the moment
 * of saving); only editing shows them, to correct an entry. The campaign of an
 * existing entry is fixed. On success the server-rendered list refreshes and
 * the modal closes; a failure shows the translated error and keeps the values.
 *
 * @param {DiceEventFormModalProps} props
 * @returns {JSX.Element}
 */
export default function DiceEventFormModal({
  campaigns,
  viewerId,
  today,
  event,
  initialUserId,
  initialKind,
  onClose,
}: DiceEventFormModalProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const ids = useId();
  const isEdit = Boolean(event);

  const [campaignId, setCampaignId] = useState(event?.campaignId ?? campaigns[0]?.id ?? "");
  const campaign = campaigns.find((c) => c.id === campaignId);
  const [userId, setUserId] = useState(
    event?.userId ??
      (initialUserId && campaign?.members.some((m) => m.userId === initialUserId) ? initialUserId : undefined) ??
      (campaign?.members.some((m) => m.userId === viewerId) ? viewerId : (campaign?.members[0]?.userId ?? "")),
  );
  const [kind, setKind] = useState<DiceEventKind>(event?.kind ?? initialKind ?? "CRITICAL");
  const [skillId, setSkillId] = useState(event?.skill.id ?? "");
  const [detail, setDetail] = useState(event?.detail ?? "");
  const [date, setDate] = useState(event?.date ?? "");
  const [time, setTime] = useState(event?.time ?? "");
  const [arcId, setArcId] = useState(event?.arcId ?? campaign?.arcs.at(-1)?.id ?? "");
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The campaign's active catalogue, plus the entry being edited if it has been
  // deactivated since (it must stay selectable or the edit would silently change it).
  const options: DiceEventSkill[] = [
    ...(campaign?.skills ?? []),
    ...(event && campaign && !campaign.skills.some((s) => s.id === event.skill.id) ? [event.skill] : []),
  ];
  const chosen = options.find((s) => s.id === skillId);

  /**
   * Switches campaign (create mode only): the player, arc and catalogue entry
   * must belong to the new one, so they fall back to the defaults of that campaign.
   *
   * @param {string} nextId - Id of the chosen campaign.
   */
  function handleCampaignChange(nextId: string) {
    const next = campaigns.find((c) => c.id === nextId);
    setCampaignId(nextId);
    setUserId(
      next?.members.some((m) => m.userId === viewerId) ? viewerId : (next?.members[0]?.userId ?? ""),
    );
    setArcId(next?.arcs.at(-1)?.id ?? "");
    setSkillId("");
    setDetail("");
  }

  /**
   * Sends the entry (POST to create, PUT to edit). On success refreshes the
   * list and closes; on failure keeps the form open with the error.
   *
   * @param {React.FormEvent<HTMLFormElement>} submitEvent - The submit event.
   */
  async function handleSubmit(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setIsPending(true);
    setErrorKey(null);
    setFieldErrors({});

    try {
      const response = await fetch(
        isEdit ? `/api/dice-events/${event?.id}` : `/api/campaigns/${campaignId}/dice-events`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            kind,
            skillId,
            detail: chosen?.allowsDetail ? detail : null,
            ...(isEdit ? { date, time } : {}),
            arcId: arcId || null,
            sessionId: event?.sessionId ?? null,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "diceEvents.errors.unknown");
        setFieldErrors(body?.fieldErrors ?? {});
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setErrorKey("diceEvents.errors.unknown");
    } finally {
      setIsPending(false);
    }
  }

  const fieldClass =
    "min-h-[44px] rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink outline-none focus:border-brand";

  /** Renders the translated error under a field, if the API flagged it. */
  const fieldError = (name: string) =>
    fieldErrors[name] ? (
      <p className="text-sm text-n" role="alert">
        {t(fieldErrors[name])}
      </p>
    ) : null;

  const title = isEdit ? t("diceEvents.form.editTitle") : t("diceEvents.form.createTitle");

  // No system, nothing to pick from: say how to fix it rather than show a dead form.
  if (campaign && !campaign.system) {
    return (
      <FiltersModal title={title} onClose={onClose}>
        <p className="text-sm text-ink">{t("diceEvents.noSystem")}</p>
        <div className="mt-4 flex gap-2">
          <Link
            href={`/campaigns/${campaign.id}/edit`}
            className="btn btn-primary min-h-[44px] flex-1 items-center justify-center px-4 text-sm font-semibold"
          >
            {t("diceEvents.noSystemAction")}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary min-h-[44px] px-4 text-sm font-semibold"
          >
            {t("common.close")}
          </button>
        </div>
      </FiltersModal>
    );
  }

  // Nobody to log for: the campaign hides its DMs and has no other member.
  if (campaign && campaign.members.length === 0) {
    return (
      <FiltersModal title={title} onClose={onClose}>
        <p className="text-sm text-ink">{t("diceEvents.noPlayers")}</p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary min-h-[44px] px-4 text-sm font-semibold"
          >
            {t("common.close")}
          </button>
        </div>
      </FiltersModal>
    );
  }

  return (
    <FiltersModal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {campaigns.length > 1 || isEdit ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-campaign`} className="text-sm font-medium text-ink">
              {t("diceEvents.form.campaign")}
            </label>
            <select
              id={`${ids}-campaign`}
              value={campaignId}
              disabled={isEdit}
              onChange={(e) => handleCampaignChange(e.target.value)}
              className={fieldClass}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-player`} className="text-sm font-medium text-ink">
            {t("diceEvents.form.player")}
          </label>
          <select
            id={`${ids}-player`}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className={fieldClass}
          >
            {campaign?.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          {fieldError("userId")}
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-ink">{t("diceEvents.form.kind")}</legend>
          <div className="flex gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`btn ${kind === k ? "btn-primary btn-filled" : "btn-secondary"} min-h-[44px] flex-1 gap-2 px-3 text-sm font-semibold`}
              >
                <DiceKindIcon kind={k} />
                {t(`diceEvents.kind.${k}`)}
              </button>
            ))}
          </div>
          {fieldError("kind")}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-skill`} className="text-sm font-medium text-ink">
            {t("diceEvents.form.skill")}
          </label>
          <SkillCombobox
            key={campaignId}
            id={`${ids}-skill`}
            options={options}
            value={skillId}
            onChange={setSkillId}
            locale={i18n.language}
          />
          {campaign?.system ? (
            <p className="text-xs text-ink-muted">
              {t("diceEvents.form.skillHint", { system: campaign.system.name })}
            </p>
          ) : null}
          {fieldError("skillId")}
        </div>

        {chosen?.allowsDetail ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-detail`} className="text-sm font-medium text-ink">
              {chosen.requiresDetail ? t("diceEvents.form.detailRequired") : t("diceEvents.form.detail")}
            </label>
            <input
              id={`${ids}-detail`}
              type="text"
              required={chosen.requiresDetail}
              autoComplete="off"
              maxLength={DICE_SKILL_MAX_LENGTH}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              className={`${fieldClass} uppercase`}
            />
            {fieldError("detail")}
          </div>
        ) : null}

        {isEdit ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-date`} className="text-sm font-medium text-ink">
                {t("diceEvents.form.date")}
              </label>
              <input
                id={`${ids}-date`}
                type="date"
                required
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={fieldClass}
              />
              {fieldError("date")}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-time`} className="text-sm font-medium text-ink">
                {t("diceEvents.form.time")}
              </label>
              <input
                id={`${ids}-time`}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={fieldClass}
              />
              {fieldError("time")}
            </div>
          </div>
        ) : null}

        {campaign && campaign.arcs.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-arc`} className="text-sm font-medium text-ink">
              {t("diceEvents.form.arc")}
            </label>
            <select
              id={`${ids}-arc`}
              value={arcId}
              onChange={(e) => setArcId(e.target.value)}
              className={fieldClass}
            >
              <option value="">{t("diceEvents.form.noArc")}</option>
              {campaign.arcs.map((arc) => (
                <option key={arc.id} value={arc.id}>
                  {arc.name
                    ? t("diceEvents.arcLabelNamed", { number: arc.number, name: arc.name })
                    : t("diceEvents.arcLabel", { number: arc.number })}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {errorKey ? (
          <p className="rounded-[var(--radius-control)] bg-n-soft px-3 py-2 text-sm text-n" role="alert">
            {t(errorKey)}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={
              isPending ||
              !userId ||
              skillId === "" ||
              (chosen?.requiresDetail === true && detail.trim() === "") ||
              (isEdit && date === "")
            }
            className="btn btn-primary min-h-[44px] flex-1 px-4 text-sm font-semibold disabled:opacity-60"
          >
            {isPending ? t("common.loading") : t("diceEvents.form.submit")}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="btn btn-secondary min-h-[44px] px-4 text-sm font-semibold disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </FiltersModal>
  );
}
