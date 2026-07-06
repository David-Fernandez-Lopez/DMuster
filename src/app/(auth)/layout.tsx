import { getServerTranslation } from "@/i18n/server";

/**
 * Layout for the authentication pages (login, register). Centers a branded
 * card on the parchment background, mobile-first.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {Promise<JSX.Element>}
 */
export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { t } = await getServerTranslation();

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10 text-brand"
            aria-hidden="true"
          >
            <path
              d="M12 2 21 7v10l-9 5-9-5V7z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
          <h1 className="font-display text-3xl font-semibold tracking-wide text-ink">
            {t("common.appName")}
          </h1>
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-bg-elevated p-6">
          {children}
        </div>
      </div>
    </main>
  );
}
