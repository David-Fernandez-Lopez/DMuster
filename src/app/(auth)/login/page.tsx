import { redirect } from "next/navigation";

import LoginForm from "@/components/auth/LoginForm";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { isMailConfigured } from "@/lib/env";

/**
 * Login page. Renders the translated heading and the client login form.
 *
 * Sends an already-signed-in visitor to the calendar, but only after `auth()`
 * confirms the session really resolves. The route proxy deliberately does not
 * make that call: it can only see whether a session *cookie* is present, and a
 * cookie whose row no longer exists would be bounced to "/", which bounces back
 * here, forever. Verifying it here is what keeps the page reachable for anyone
 * holding a stale cookie — and therefore what makes deleting session rows a
 * usable way to revoke access.
 *
 * `?reset=1` (set after a successful password reset) shows a confirmation.
 *
 * @param {{ searchParams: Promise<{ reset?: string }> }} props - Query string.
 * @returns {Promise<JSX.Element>}
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const { reset } = await searchParams;
  const { t } = await getServerTranslation();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-center font-display text-xl font-semibold text-ink">
        {t("auth.login.title")}
      </h2>
      <LoginForm showForgotPassword={isMailConfigured} passwordWasReset={reset === "1"} />
    </div>
  );
}
