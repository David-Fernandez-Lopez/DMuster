import { redirect } from "next/navigation";

import SessionCard from "@/components/sessions/SessionCard";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { listUpcomingSessions } from "@/lib/confirmedSessionService";

/**
 * "Próximas partidas" page (`/sessions`) — lists the user's own campaigns'
 * future active confirmed sessions, soonest first. Requires an authenticated
 * session; anonymous users are redirected to `/login`.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function SessionsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { t } = await getServerTranslation();
  const sessions = await listUpcomingSessions(session.user.id);

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-6 py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {t("sessions.title")}
      </h1>

      {sessions.length === 0 ? (
        <p className="mt-6 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-6 text-center text-sm text-ink-muted">
          {t("sessions.empty")}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {sessions.map((upcomingSession) => (
            <SessionCard key={upcomingSession.id} session={upcomingSession} />
          ))}
        </ul>
      )}
    </main>
  );
}
