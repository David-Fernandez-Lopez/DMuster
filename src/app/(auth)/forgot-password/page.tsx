import { notFound } from "next/navigation";

import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { getServerTranslation } from "@/i18n/server";
import { isMailConfigured } from "@/lib/env";

/**
 * Forgot-password page, reached from the login page. 404 when SMTP is not
 * configured, since no email could be sent.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function ForgotPasswordPage() {
  if (!isMailConfigured) {
    notFound();
  }
  const { t } = await getServerTranslation();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-center font-display text-xl font-semibold text-ink">
        {t("passwordReset.forgot.title")}
      </h2>
      <ForgotPasswordForm />
    </div>
  );
}
