import type { Metadata } from "next";
import { Cinzel, Manrope } from "next/font/google";
import "./globals.css";

import I18nProvider from "@/i18n/I18nProvider";
import { getLocale } from "@/i18n/server";

// Display font for headings and the brand (subtle medieval serif); body/UI font.
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cinzel",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
});

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
    <html
      lang={locale}
      className={`h-full ${cinzel.variable} ${manrope.variable}`}
    >
      <body className="min-h-full flex flex-col antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
