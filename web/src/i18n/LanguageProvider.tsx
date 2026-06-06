import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { defaultLocale, languageStorageKey, locales, numberLocales, translations, type Locale } from "./translations";

type TranslationValue = string | number;
type TranslationVars = Record<string, TranslationValue>;

type I18nContextValue = {
  locale: Locale;
  numberLocale: string;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, vars?: TranslationVars) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale;
  const stored = window.localStorage.getItem(languageStorageKey);
  return stored && isLocale(stored) ? stored : defaultLocale;
}

function interpolate(template: string, vars?: TranslationVars) {
  if (!vars) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? "" : String(value);
  });
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(languageStorageKey, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = translations[locale];

    return {
      locale,
      numberLocale: numberLocales[locale],
      setLocale,
      toggleLocale: () => setLocale((current) => (current === "zh-TW" ? "en" : "zh-TW")),
      t: (key, vars) => {
        const fallback = translations[defaultLocale][key] ?? key;
        return interpolate(dictionary[key] ?? fallback, vars);
      },
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within LanguageProvider");
  }

  return context;
}
