import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/i18n';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'en' | 'es' | 'fr' | 'it' | 'pt';

export const SUPPORTED_LANGUAGES: { code: AppLanguage; flag: string; label: string }[] = [
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'en', flag: '🇺🇸', label: 'English' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
  { code: 'pt', flag: '🇵🇹', label: 'Português' },
];

const LANGUAGE_ORDER: AppLanguage[] = ['es', 'en', 'fr', 'it', 'pt'];

function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'en' || value === 'es' || value === 'fr' || value === 'it' || value === 'pt';
}

/** Header Accept-Language para APIs que localizan mensajes JSON. */
export function toAcceptLanguageHeader(lang: AppLanguage): { 'Accept-Language': string } {
  const map: Record<AppLanguage, string> = {
    es: 'es',
    en: 'en',
    fr: 'fr',
    it: 'it',
    pt: 'pt',
  };
  return { 'Accept-Language': map[lang] };
}

/** Usado también por servicios fuera de React (p. ej. biometricAuth). */
export const APP_LANGUAGE_STORAGE_KEY = 'card-social:app-language';
const LANGUAGE_STORAGE_KEY = APP_LANGUAGE_STORAGE_KEY;

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (next: AppLanguage) => void;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('es');

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isAppLanguage(stored)) {
          setLanguageState(stored);
        } else if (stored) {
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'es').catch(() => null);
        }
      } catch {
        // Ignore storage read failures and keep default language.
      }
    })();
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language]);

  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next).catch(() => null);
  };

  const toggleLanguage = () => {
    const i = LANGUAGE_ORDER.indexOf(language);
    setLanguage(LANGUAGE_ORDER[(i + 1) % LANGUAGE_ORDER.length]);
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return context;
}

/** Pantallas de auth o código que puede montar antes del provider; default ES. */
export function useLanguageOptional(): LanguageContextValue | null {
  return useContext(LanguageContext);
}
