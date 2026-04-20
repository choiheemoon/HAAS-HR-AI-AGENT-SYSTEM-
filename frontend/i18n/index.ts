import en from '@/i18n/locales/en';
import ko from '@/i18n/locales/ko';
import th from '@/i18n/locales/th';
import { Locale, TranslationDict } from '@/i18n/types';

const dictionaries: Record<Locale, TranslationDict> = { ko, en, th };
const defaultLocale: Locale = 'ko';

export function getDictionary(locale: Locale): TranslationDict {
  return dictionaries[locale] || dictionaries[defaultLocale];
}

export function translate(locale: Locale, key: string, fallback?: string): string {
  const dict = getDictionary(locale);
  return dict[key] || fallback || key;
}

export const supportedLocales: Locale[] = ['ko', 'en', 'th'];
export { defaultLocale };
