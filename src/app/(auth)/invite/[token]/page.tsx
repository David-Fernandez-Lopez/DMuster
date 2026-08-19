import type { TFunction } from "i18next";
import Link from "next/link";

import { logoutToInvitation } from "@/app/(auth)/actions";
import AcceptInviteForm from "@/components/auth/AcceptInviteForm";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { getInvitationForToken } from "@/lib/invitationService";

type InvitePageProps = { params: Promise<{ token: string }> };

/**
 * Plain, form-less explanation for a non-acceptable invitation link
 * (unresolvable, expired, revoked, or already used) with a way back to login.
 *
 * @param {{ t: TFunction; messageKey: string }} props - Translator and the
 *   i18n key explaining why the link can't be used.
 * @returns {JSX.Element}
 */
function InvitationNotice({ t, messageKey }: { t: TFunction; messageKey: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h2 className="font-display text-xl font-semibold text-ink">
        {t("invitations.accept.title")}
      </h2>
      <p className="text-sm text-ink-muted">{t(messageKey)}</p>
      <Link href="/login" className="font-semibold text-brand hover:underline">
        {t("invitations.accept.backToLogin")}
      </Link>
    </div>
  );
}

/**
 * Public invitation accept page. Resolves the raw token from the URL and
 * renders one of three states:
 * - Unresolvable, expired, revoked, or already-used → a plain explanation and
 *   a link back to `/login`, **never a form**.
 * - Pending, but a session already exists → a "signed in as X" notice with a
 *   sign-out control that returns to this same link, so a visitor in a shared
 *   or already-used browser can switch accounts without losing it.
 * - Pending, anonymous → the accept form, email fixed and read-only.
 *
 * Deliberately reachable with or without a session: `src/proxy.ts` excludes
 * `/invite` from both the protected-route redirect and the "already signed
 * in" bounce that `/login` gets, so the second branch above is actually
 * reachable instead of the visitor silently landing on `/`.
 *
 * @param {InvitePageProps} props - Route props with the async `params`.
 * @returns {Promise<JSX.Element>}
 */
export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const { t } = await getServerTranslation();
  const result = await getInvitationForToken(token);

  if (!result.ok) {
    return <InvitationNotice t={t} messageKey={result.error} />;
  }

  if (result.invitation.status !== "pending") {
    const messageKey =
      result.invitation.status === "accepted"
        ? "invitations.errors.alreadyAccepted"
        : `invitations.errors.${result.invitation.status}`;
    return <InvitationNotice t={t} messageKey={messageKey} />;
  }

  const { invitation } = result;
  const session = await auth();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-center font-display text-xl font-semibold text-ink">
        {t("invitations.accept.title")}
      </h2>
      <p className="text-center text-sm text-ink-muted">
        {t("invitations.accept.subtitle")}
      </p>

      {invitation.campaign ? (
        <p className="text-center text-sm text-ink-muted">
          {t("invitations.accept.joiningCampaign", { campaign: invitation.campaign.name })}
        </p>
      ) : null}

      {session?.user ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-ink-muted">
            {t("invitations.accept.signedIn", { name: session.user.name })}
          </p>
          <form action={logoutToInvitation}>
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="btn btn-secondary min-h-[44px] px-4 text-sm font-semibold"
            >
              {t("invitations.accept.signOut")}
            </button>
          </form>
        </div>
      ) : (
        <AcceptInviteForm token={token} email={invitation.email} />
      )}
    </div>
  );
}
