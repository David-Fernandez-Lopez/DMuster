import Link from "next/link";
import { notFound } from "next/navigation";

import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { getServerTranslation } from "@/i18n/server";
import { isMailConfigured } from "@/lib/env";
import { isResetTokenValid } from "@/lib/passwordResetService";

/**
 * Landing page of a reset link. Shows the new-password form for a redeemable
 * token, or one generic explanation for any unusable one (unknown, used,
 * expired, disabled account) so the page reveals nothing about which it was.
 *
 * @param {{ params: Promise<{ token: string }> }} props - Route params.
 * @returns {Promise<JSX.Element>}
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!isMailConfigured) {
    notFound();
  }
  const { token } = await params;
  const { t } = await getServerTranslation();
  const valid = await isResetTokenValid(token);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-center font-display text-xl font-semibold text-ink">
        {t("passwordReset.reset.title")}
      </h2>
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="rounded-[var(--radius-control)] bg-n-soft px-3 py-2 text-sm text-n" role="alert">
            {t("passwordReset.errors.invalidToken")}
          </p>
          <Link href="/forgot-password" className="text-center text-sm text-brand underline">
            {t("passwordReset.reset.requestAnother")}
          </Link>
        </div>
      )}
    </div>
  );
}
