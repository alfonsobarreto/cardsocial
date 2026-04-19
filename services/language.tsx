import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/i18n';
import { hashUiPair } from '@/services/uiStringHash';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'en' | 'es' | 'fr' | 'it' | 'pt';

export const SUPPORTED_LANGUAGES: { code: AppLanguage; flag: string; label: string }[] = [
  { code: 'en', flag: '🇺🇸', label: 'English' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
  /** pt-BR; código interno `pt`. */
  { code: 'pt', flag: '🇧🇷', label: 'Português (Brasil)' },
];

/** Usado también por servicios fuera de React (p. ej. biometricAuth). */
export const APP_LANGUAGE_STORAGE_KEY = 'card-social:app-language';
const LANGUAGE_STORAGE_KEY = APP_LANGUAGE_STORAGE_KEY;

function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'en' || value === 'es' || value === 'fr' || value === 'it' || value === 'pt';
}

/**
 * Primer segmento del locale del dispositivo (p. ej. `es` desde `es-MX`).
 * Usa solo `Intl` — no requiere el módulo nativo `expo-localization` ni rebuild del dev client.
 */
function primaryLanguageCodeFromDevice(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    if (locale) {
      return locale.split(/[-_]/)[0]?.toLowerCase() ?? 'en';
    }
  } catch {
    /* ignore */
  }
  return 'en';
}

/**
 * Idioma por defecto según el dispositivo. Solo códigos soportados; si no coincide → inglés.
 */
export function deviceDefaultLanguage(): AppLanguage {
  const primary = primaryLanguageCodeFromDevice();
  if (primary === 'es') return 'es';
  if (primary === 'fr') return 'fr';
  if (primary === 'it') return 'it';
  if (primary === 'pt') return 'pt';
  return 'en';
}

/**
 * Pares (es, en) de la UI → clave `ui.x{hash}` en i18n.
 * Si existe traducción para `lang`, se usa; si no, `defaultValue` (es o en).
 * Añade entradas en `locales/_generated/{lang}.fragment.json` (p. ej. con `scripts/fill-ui-fragments.mjs`).
 */
export function trEsEn(es: string, en: string, lang: AppLanguage): string {
  const key = `ui.x${hashUiPair(es, en)}`;
  return String(
    i18n.t(key, {
      lng: lang,
      defaultValue: lang === 'es' ? es : en,
    }),
  );
}

/** Backend / QR APIs today only accept `en` | `es`. Map other UI languages to `en`. */
export function toApiLocale(lang: AppLanguage): 'en' | 'es' {
  return lang === 'es' ? 'es' : 'en';
}

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (next: AppLanguage) => void;
  /** Cicla en el orden de `SUPPORTED_LANGUAGES` (p. ej. atajo interno). */
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        let next: AppLanguage;
        if (isAppLanguage(stored)) {
          next = stored;
        } else if (stored) {
          next = 'en';
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'en').catch(() => null);
        } else {
          next = deviceDefaultLanguage();
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next).catch(() => null);
        }
        setLanguageState(next);
      } catch {
        /* ignore storage read failures */
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
    const idx = SUPPORTED_LANGUAGES.findIndex((l) => l.code === language);
    const nextIdx = idx < 0 ? 0 : (idx + 1) % SUPPORTED_LANGUAGES.length;
    setLanguage(SUPPORTED_LANGUAGES[nextIdx].code);
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
    }),
    [language],
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

export function useTr() {
  const { language } = useLanguage();
  return useCallback((es: string, en: string) => trEsEn(es, en, language), [language]);
}

/** Pantallas de auth o código que puede montar antes del provider; default EN. */
export function useLanguageOptional(): LanguageContextValue | null {
  return useContext(LanguageContext);
}
