'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { defaultLocale, supportedLocales, translate } from '@/i18n';
import { Locale } from '@/i18n/types';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const LOCALE_STORAGE_KEY = 'hr-ai-agent-locale';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
    if (saved && supportedLocales.includes(saved)) {
      setLocaleState(saved);
      return;
    }
    const browserLang = (navigator.language || '').toLowerCase();
    if (browserLang.startsWith('th')) {
      setLocaleState('th');
    } else if (browserLang.startsWith('en')) {
      setLocaleState('en');
    } else {
      setLocaleState(defaultLocale);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: string, fallback?: string) => translate(locale, key, fallback),
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
