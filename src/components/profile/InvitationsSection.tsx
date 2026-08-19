"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import RevokeInvitationButton from "@/components/profile/RevokeInvitationButton";
import type { InvitationStatus } from "@/lib/invitation";
import type { InvitationDto } from "@/lib/invitationService";

/** A campaign the current user is DM of, offered in the campaign picker. */
type DmCampaignOption = { id: string; name: string; tag: string };

interface InvitationsSectionProps {
  /** The invitations this user has sent, newest first. */
  invitations: InvitationDto[];
  /** Campaigns the user is DM of — the only ones an invitation may scope to. */
  dmCampaigns: DmCampaignOption[];
}

/** Viability-token tint per derived status, matching the S/N/T palette. */
const STATUS_TINT: Record<InvitationStatus, string> = {
  pending: "bg-t-soft text-t",
  accepted: "bg-s-soft text-s",
  revoked: "bg-bg text-ink-muted",
  expired: "bg-bg text-ink-muted",
};

/** What a create/regenerate POST to `/api/invitations` resolves to. */
type CreateOutcome = { ok: true; url: string } | { ok: false; error: string };

/**
 * `/profile` section for managing invitations (roadmap #24), rendered only
 * for a user who is DM of at least one campaign. A form creates a new
 * single-use link, optionally scoped to one of the user's DM campaigns and a
 * role in it; the link is shown exactly once, with a copy button (falling
 * back to select-to-copy when the Clipboard API is unavailable, e.g. plain
 * HTTP on a LAN address). Below, every invitation this user has sent, with
 * its derived status, a revoke control, and — for a still-pending one —
 * "Regenerate link" (only the hash is stored, so re-showing an old link is
 * impossible by design; regenerating revokes it and creates a fresh one).
 *
 * @param {InvitationsSectionProps} props - The user's sent invitations and DM campaigns.
 * @returns {JSX.Element} The invitations management section.
 */
export default function InvitationsSection({
  invitations,
  dmCampaigns,
}: InvitationsSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const emailInputId = useId();
  const campaignSelectId = useId();
  const roleSelectId = useId();
  const linkInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [role, setRole] = useState<"PLAYER" | "DM">("PLAYER");
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [readyLink, setReadyLink] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  /**
   * Posts a create-invitation request and normalizes the response.
   *
   * @param {{ email: string; campaignId?: string; role?: string }} payload - The invitation to create.
   * @returns {Promise<CreateOutcome>} The one-time link, or a translated error key.
   */
  async function submitInvitation(payload: {
    email: string;
    campaignId?: string;
    role?: string;
  }): Promise<CreateOutcome> {
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        return { ok: false, error: body?.error ?? "invitations.errors.unknown" };
      }
      return { ok: true, url: body.data.url as string };
    } catch {
      return { ok: false, error: "invitations.errors.unknown" };
    }
  }

  /**
   * Submits the create form: validates client-side only via required fields,
   * posts the invitation, and on success shows the one-time link and resets
   * the form while refreshing the server-rendered list below.
   *
   * @param {React.FormEvent<HTMLFormElement>} event - The submit event.
   */
  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setErrorKey(null);

    const result = await submitInvitation({
      email,
      campaignId: campaignId || undefined,
      role: campaignId ? role : undefined,
    });

    setIsPending(false);
    if (!result.ok) {
      setErrorKey(result.error);
      return;
    }

    setReadyLink(result.url);
    setCopyState("idle");
    setEmail("");
    setCampaignId("");
    setRole("PLAYER");
    router.refresh();
  }

  /**
   * Revokes a pending invitation, then immediately creates a fresh one for
   * the same email/campaign/role. The list is refreshed right after the
   * revoke succeeds — regardless of whether the re-create that follows also
   * succeeds — so the UI never keeps showing a row as pending after its link
   * has actually been revoked server-side.
   *
   * @param {InvitationDto} invitation - The pending invitation to regenerate.
   */
  async function handleRegenerate(invitation: InvitationDto) {
    setRegeneratingId(invitation.id);
    setErrorKey(null);

    try {
      const deleteResponse = await fetch(`/api/invitations/${invitation.id}`, {
        method: "DELETE",
      });
      if (!deleteResponse.ok) {
        const body = await deleteResponse.json().catch(() => null);
        setErrorKey(body?.error ?? "invitations.errors.unknown");
        return;
      }

      const result = await submitInvitation({
        email: invitation.email,
        campaignId: invitation.campaign?.id,
        role: invitation.role ?? undefined,
      });

      router.refresh();
      if (!result.ok) {
        setErrorKey(result.error);
        return;
      }

      setReadyLink(result.url);
      setCopyState("idle");
    } finally {
      setRegeneratingId(null);
    }
  }

  /**
   * Copies the one-time link via the Clipboard API when available; otherwise
   * selects the (read-only) link input so the user can copy it manually —
   * `navigator.clipboard` is undefined over plain HTTP on a non-localhost
   * address, which a LAN deployment can easily hit.
   */
  async function handleCopy() {
    if (!readyLink) {
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(readyLink);
        setCopyState("copied");
        return;
      } catch {
        // Fall through to the manual selection below.
      }
    }
    linkInputRef.current?.select();
    setCopyState("manual");
  }

  return (
    <section className="mt-6 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-6">
      <h2 className="font-display text-xl font-semibold text-ink">
        {t("invitations.title")}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{t("invitations.help")}</p>

      <form
        onSubmit={handleCreate}
        className="mt-4 flex flex-col gap-3 rounded-[var(--radius-control)] border border-border p-4"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={emailInputId} className="text-sm font-medium text-ink">
            {t("invitations.emailLabel")}
          </label>
          <input
            id={emailInputId}
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-[44px] rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink outline-none focus:border-brand"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={campaignSelectId} className="text-sm font-medium text-ink">
            {t("invitations.campaignLabel")}
          </label>
          <select
            id={campaignSelectId}
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
            className="min-h-[44px] rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink"
          >
            <option value="">{t("invitations.noCampaign")}</option>
            {dmCampaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} ({campaign.tag})
              </option>
            ))}
          </select>
        </div>

        {campaignId ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={roleSelectId} className="text-sm font-medium text-ink">
              {t("invitations.roleLabel")}
            </label>
            <select
              id={roleSelectId}
              value={role}
              onChange={(event) => setRole(event.target.value as "PLAYER" | "DM")}
              className="min-h-[44px] rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink"
            >
              <option value="PLAYER">{t("campaigns.role.PLAYER")}</option>
              <option value="DM">{t("campaigns.role.DM")}</option>
            </select>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="btn btn-primary min-h-[44px] px-4 text-sm font-semibold disabled:opacity-60"
        >
          {isPending ? t("common.loading") : t("invitations.create")}
        </button>

        {errorKey ? (
          <p className="text-sm text-n" role="alert">
            {t(errorKey)}
          </p>
        ) : null}
      </form>

      {readyLink ? (
        <div className="mt-4 rounded-[var(--radius-control)] border border-brand bg-brand-soft p-4">
          <p className="text-sm font-semibold text-ink">{t("invitations.showOnce")}</p>
          <div className="mt-2 flex gap-2">
            <input
              ref={linkInputRef}
              type="text"
              readOnly
              value={readyLink}
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-[44px] flex-1 truncate rounded-[var(--radius-control)] border border-border bg-bg px-3 text-sm text-ink"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="btn btn-secondary min-h-[44px] shrink-0 px-4 text-sm font-semibold"
            >
              {copyState === "copied" ? t("invitations.copied") : t("invitations.copy")}
            </button>
          </div>
          {copyState === "manual" ? (
            <p className="mt-2 text-xs text-ink-muted">{t("invitations.copyManual")}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">
        {invitations.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("invitations.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="rounded-[var(--radius-control)] border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-ink">
                    {invitation.email}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TINT[invitation.status]}`}
                  >
                    {t(`invitations.status.${invitation.status}`)}
                  </span>
                </div>

                {invitation.campaign ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    {invitation.campaign.tag} ·{" "}
                    {t(`campaigns.role.${invitation.role ?? "PLAYER"}`)}
                  </p>
                ) : null}

                {invitation.status === "pending" ? (
                  <>
                    <p className="mt-1 text-xs text-ink-muted">
                      {t("invitations.expiresIn", { count: invitation.daysLeft })}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRegenerate(invitation)}
                        disabled={regeneratingId === invitation.id}
                        className="btn btn-secondary min-h-[36px] px-3 text-xs font-semibold disabled:opacity-60"
                      >
                        {regeneratingId === invitation.id
                          ? t("common.loading")
                          : t("invitations.regenerate")}
                      </button>
                      <RevokeInvitationButton invitationId={invitation.id} />
                    </div>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
