"use client";

import { useTranslation } from "react-i18next";

/**
 * Small client-rendered badge proving that client components resolve
 * translations through the i18n provider. Shows the app name plus the
 * active locale code.
 *
 * @returns {JSX.Element} Badge with a translated key and the current locale.
 */
export default function LocaleBadge() {
  const { t, i18n } = useTranslation();

  return (
    <span className="mt-8 rounded-full border border-gray-300 px-3 py-1 text-xs uppercase tracking-widest text-gray-500">
      {t("common.appName")} · {i18n.language}
    </span>
  );
}
