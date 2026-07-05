import type { Metadata } from "next";
import "./globals.css";

import I18nProvider from "@/i18n/I18nProvider";
import { getLocale } from "@/i18n/server";

export const metadata: Metadata = {
  title: "DMuster",
  description: "Manage player availability across your tabletop RPG campaigns.",
};

/**
 * Root layout wrapping every page in the application.
 * Resolves the request locale (cookie → default), sets it on the html tag
 * and provides the client-side i18n context.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {Promise<JSX.Element>}
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale} className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
