import type { Metadata } from "next";
import { Cinzel, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

import I18nProvider from "@/i18n/I18nProvider";
import { getLocale } from "@/i18n/server";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

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
 * Resolves the request locale (user profile → cookie → default) and sets it on
 * the html tag, stamps the manual theme override (`data-theme`) from the theme
 * cookie when present, and provides the client-side i18n context.
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

  const themeValue = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(themeValue) ? themeValue : undefined;

  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`h-full ${cinzel.variable} ${manrope.variable}`}
    >
      <body className="min-h-full flex flex-col antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
