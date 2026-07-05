"use client";

import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import { DEFAULT_LOCALE, getOptions } from "./settings";

// Singleton browser instance; I18nProvider switches it to the server-resolved
// locale before the first client render (synchronous because initAsync is
// disabled in getOptions).
i18next.use(initReactI18next).init(getOptions(DEFAULT_LOCALE));

export default i18next;
