import { redirect } from "next/navigation";

import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";

/**
 * "Mi disponibilidad" page (`/availability`). Currently a minimal stub so the
 * nav destination has a real target; the responding flow (list of upcoming
 * eligible days with Sí/No toggles) is built in step #16. Requires an
 * authenticated session.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function AvailabilityPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { t } = await getServerTranslation();

  return (
    <main className="mx-auto w-full max-w-[420px] flex-1 px-6 py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {t("nav.availability")}
      </h1>
    </main>
  );
}
