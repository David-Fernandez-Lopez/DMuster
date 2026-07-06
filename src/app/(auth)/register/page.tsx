import RegisterForm from "@/components/auth/RegisterForm";
import { getServerTranslation } from "@/i18n/server";

/**
 * Registration page. Renders the translated heading and the client sign-up form.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function RegisterPage() {
  const { t } = await getServerTranslation();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-center font-display text-xl font-semibold text-ink">
        {t("auth.register.title")}
      </h2>
      <RegisterForm />
    </div>
  );
}
