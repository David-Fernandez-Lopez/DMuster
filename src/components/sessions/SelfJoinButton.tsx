"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface SelfJoinButtonProps {
  /** The confirmed session being joined. */
  sessionId: string;
}

/**
 * "Sumarme a la partida" (roadmap #22): lets a member who missed the initial
 * attendee set add themselves once they've answered Sí, without bothering the
 * DM. Posts with an empty body — the server resolves the session user as the
 * self-join target. Only rendered by the caller when
 * `confirmedSession.viewerCanSelfJoin` is true; a race (someone else changed
 * the state between render and click) surfaces as a translated inline error.
 *
 * @param {SelfJoinButtonProps} props
 * @returns {JSX.Element}
 */
export default function SelfJoinButton({ sessionId }: SelfJoinButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<
    Record<string, string> | undefined
  >();

  async function handleClick() {
    setIsPending(true);
    setErrorKey(null);
    setErrorParams(undefined);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="btn btn-primary min-h-[44px] w-full text-sm font-semibold disabled:opacity-60"
      >
        {isPending ? t("common.loading") : t("sessions.selfJoin")}
      </button>
      {errorKey ? (
        <p className="text-sm text-n" role="alert">
          {t(errorKey, errorParams)}
        </p>
      ) : null}
    </div>
  );
}
