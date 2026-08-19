"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { SessionMemberDto } from "@/lib/confirmedSessionService";

/** One member of a session's campaign, with whether they currently attend it. */
export type AttendeeListMember = SessionMemberDto & { isAttending: boolean };

interface AttendeeControlsProps {
  /** The confirmed session attendees are being managed for. */
  sessionId: string;
  /** Every campaign member, split into attending / not attending below. */
  members: AttendeeListMember[];
  /** Whether the viewer is a DM of the session's campaign — gates the +/- controls. */
  viewerIsDm: boolean;
}

/** Soft-pill classes + label key per response value (null = pending). */
const STATUS_STYLE: Record<
  "YES" | "NO" | "MAYBE" | "NONE",
  { className: string; labelKey: string }
> = {
  YES: { className: "bg-s-soft text-s", labelKey: "date.status.yes" },
  MAYBE: { className: "bg-t-soft text-t", labelKey: "date.status.maybe" },
  NO: { className: "bg-n-soft text-n", labelKey: "date.status.no" },
  NONE: {
    className: "border border-border bg-bg text-ink-muted",
    labelKey: "date.status.none",
  },
};

interface AttendeeRowProps {
  member: AttendeeListMember;
  /** Present only for a DM viewer — renders the +/- icon button. */
  action: { symbol: string; label: string; pending: boolean; onClick: () => void } | null;
}

/**
 * One member's row inside the attendee list: an avatar initial, the member's
 * name, a "Máster" badge for DMs, their status pill, and — for a DM viewer —
 * an add/remove icon button. Mirrors `PlayerStatusRow`'s visual language but
 * with a real interactive slot instead of its chevron-aligning spacer.
 *
 * @param {AttendeeRowProps} props
 * @returns {JSX.Element}
 */
function AttendeeRow({ member, action }: AttendeeRowProps) {
  const { t } = useTranslation();
  const style = STATUS_STYLE[member.status ?? "NONE"];
  const initial = member.name.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-ink">{member.name}</span>
      {member.isDm ? (
        <span className="shrink-0 rounded-[var(--radius-control)] bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
          {t("date.dmBadge")}
        </span>
      ) : null}
      <span
        className={`shrink-0 rounded-[var(--radius-control)] px-2 py-0.5 text-xs font-semibold ${style.className}`}
      >
        {t(style.labelKey)}
      </span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.pending}
          aria-label={`${action.label} ${member.name}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
        >
          {action.symbol}
        </button>
      ) : (
        <span aria-hidden="true" className="h-6 w-6 shrink-0" />
      )}
    </div>
  );
}

/**
 * The attendee list of a confirmed session (roadmap #22): a "Juegan: N"
 * header, one row per attending member with a "−" remove button (DM only),
 * then — when the campaign has non-attending members — a greyed-out
 * "No juegan" section with a "+" add button (DM only) per row. A shared
 * inline error surfaces a blocked add/remove (e.g. the target already plays
 * another session that day). Renders read-only rows (no buttons) for a
 * non-DM viewer.
 *
 * @param {AttendeeControlsProps} props
 * @returns {JSX.Element}
 */
export default function AttendeeControls({
  sessionId,
  members,
  viewerIsDm,
}: AttendeeControlsProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<
    Record<string, string> | undefined
  >();

  const attending = members.filter((member) => member.isAttending);
  const notAttending = members.filter((member) => !member.isAttending);

  /**
   * Adds or removes one member, clearing/reporting the shared inline error.
   *
   * @param {string} userId - The target member.
   * @param {"add" | "remove"} action - Which mutation to perform.
   */
  async function mutate(userId: string, action: "add" | "remove") {
    setPendingUserId(userId);
    setErrorKey(null);
    setErrorParams(undefined);

    try {
      const response =
        action === "add"
          ? await fetch(`/api/sessions/${sessionId}/attendees`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId }),
            })
          : await fetch(`/api/sessions/${sessionId}/attendees/${userId}`, {
              method: "DELETE",
            });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "sessions.errors.unknown");
        setErrorParams(body?.params);
        return;
      }

      router.refresh();
    } catch {
      setErrorKey("sessions.errors.unknown");
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <div
      className="flex flex-col gap-1"
      role="group"
      aria-label={t("sessions.attendees")}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {t("sessions.attendeesCount", { count: attending.length })}
      </p>
      <div className="flex flex-col">
        {attending.map((member) => (
          <AttendeeRow
            key={member.userId}
            member={member}
            action={
              viewerIsDm
                ? {
                    symbol: "−",
                    label: t("sessions.removeAttendee"),
                    pending: pendingUserId === member.userId,
                    onClick: () => mutate(member.userId, "remove"),
                  }
                : null
            }
          />
        ))}
      </div>

      {notAttending.length > 0 ? (
        <>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("sessions.notAttending")}
          </p>
          <div className="flex flex-col opacity-50">
            {notAttending.map((member) => (
              <AttendeeRow
                key={member.userId}
                member={member}
                action={
                  viewerIsDm
                    ? {
                        symbol: "+",
                        label: t("sessions.addAttendee"),
                        pending: pendingUserId === member.userId,
                        onClick: () => mutate(member.userId, "add"),
                      }
                    : null
                }
              />
            ))}
          </div>
        </>
      ) : null}

      {errorKey ? (
        <p className="text-sm text-n" role="alert">
          {t(errorKey, errorParams)}
        </p>
      ) : null}
    </div>
  );
}
