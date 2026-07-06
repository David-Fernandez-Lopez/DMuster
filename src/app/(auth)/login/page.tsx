import LoginForm from "@/components/auth/LoginForm";
import { getServerTranslation } from "@/i18n/server";

/**
 * Login page. Renders the translated heading and the client login form.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function LoginPage() {
  const { t } = await getServerTranslation();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-center font-display text-xl font-semibold text-ink">
        {t("auth.login.title")}
      </h2>
      <LoginForm />
    </div>
  );
}
