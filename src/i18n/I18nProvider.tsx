"use client";

import { I18nextProvider } from "react-i18next";

import i18n from "./client";
import type { AppLocale } from "./settings";

interface I18nProviderProps {
  locale: AppLocale;
  children: React.ReactNode;
}

/**
 * Client-side i18n provider that keeps the singleton i18next instance in
 * sync with the locale resolved on the server, so client components hydrate
 * in the same language as the server-rendered HTML.
 *
 * @param {I18nProviderProps} props - Server-resolved locale and subtree.
 * @returns {JSX.Element} Subtree wrapped in the i18next context.
 */
export default function I18nProvider({ locale, children }: I18nProviderProps) {
  if (i18n.language !== locale) {
    // Synchronous: resources are bundled and initAsync is disabled.
    i18n.changeLanguage(locale);
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
