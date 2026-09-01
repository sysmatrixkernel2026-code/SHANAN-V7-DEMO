import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Locale } from '../types';
import { translations, type TranslationKey } from './translations';

interface LanguageContextValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const STORAGE_KEY = 'shanan-locale';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get('lang');
    if (urlLang === 'ar' || urlLang === 'en') {
      localStorage.setItem(STORAGE_KEY, urlLang);
      return urlLang;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'ar' || stored === 'en' ? stored : 'en';
  });

  const dir: 'rtl' | 'ltr' = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale, dir]);

  const setLocale = (l: Locale) => setLocaleState(l);
  const toggleLocale = () => setLocaleState(prev => (prev === 'ar' ? 'en' : 'ar'));
  const t = (key: TranslationKey): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[locale] ?? entry.en ?? key;
  };

  return (
    <LanguageContext.Provider value={{ locale, dir, setLocale, toggleLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
