import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/i18n';
import { dashboardUiLocaleExtra } from '@/services/dashboardUiLocaleExtra';
import { hashUiPair } from '@/services/uiStringHash';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'en' | 'es' | 'fr' | 'it' | 'pt' | 'de';

export const SUPPORTED_LANGUAGES: { code: AppLanguage; flag: string; label: string }[] = [
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'en', flag: '🇺🇸', label: 'English' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
  /** pt-BR; código interno `pt`. */
  { code: 'pt', flag: '🇧🇷', label: 'Português (Brasil)' },
];

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'en' || value === 'es' || value === 'fr' || value === 'it' || value === 'pt' || value === 'de';
}

/** Header Accept-Language para APIs (QR / público) con los idiomas de la app. */
export function toAcceptLanguageHeader(lang: AppLanguage): { 'Accept-Language': string } {
  const map: Record<AppLanguage, string> = {
    es: 'es',
    en: 'en',
    de: 'de',
    fr: 'fr',
    it: 'it',
    pt: 'pt',
  };
  return { 'Accept-Language': map[lang] };
}

/**
 * Locale BCP 47 para `Intl`/`toLocale*` sin cambiar el comportamiento de fr/it/pt
 * (siguen usando `es-MX` donde antes era “no inglés”).
 */
export function intlLocaleTagForAppLanguage(lang: AppLanguage): string {
  if (lang === 'en') return 'en-US';
  if (lang === 'de') return 'de-DE';
  if (lang === 'fr') return 'fr-FR';
  if (lang === 'it') return 'it-IT';
  if (lang === 'pt') return 'pt-BR';
  return 'es-MX';
}

/** Texto legal en correo de eliminación: español solo para `es`; resto en inglés (fecha sigue localizada con `intlLocaleTag`). */
export function emailCopyLocaleFromAppLanguage(lang: AppLanguage): 'es' | 'en' {
  return lang === 'es' ? 'es' : 'en';
}

/** Locale para listas administrativas (fecha legible por fila). */
export function localeStringForReportDates(lang: AppLanguage): string {
  if (lang === 'en') return 'en';
  if (lang === 'pt') return 'pt-BR';
  if (lang === 'fr') return 'fr';
  if (lang === 'it') return 'it';
  if (lang === 'de') return 'de';
  return 'es';
}

/** Usado también por servicios fuera de React (p. ej. biometricAuth). */
export const APP_LANGUAGE_STORAGE_KEY = 'card-social:app-language';
const LANGUAGE_STORAGE_KEY = APP_LANGUAGE_STORAGE_KEY;

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
  if (primary === 'de') return 'de';
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
export function translateUiEsEnPair(es: string, en: string, lang: AppLanguage): string {
  const extra = dashboardUiLocaleExtra(es, en, lang);
  if (extra !== null) return extra;
  const key = `ui.x${hashUiPair(es, en)}`;
  return String(
    i18n.t(key, {
      lng: lang,
      defaultValue: lang === 'es' ? es : en,
    }),
  );
}

/** Backend / QR: algunos endpoints solo aceptan `en` | `es`. Map otros idiomas UI → `en`. */
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
  /** Primer paint: idioma del dispositivo (Intl); si no es uno admitido → `deviceDefaultLanguage()`. */
  const [language, setLanguageState] = useState<AppLanguage>(() => deviceDefaultLanguage());

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
        setLanguageState(deviceDefaultLanguage());
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

/** Pantallas de auth o código que puede montar antes del provider; default EN. */
export function useLanguageOptional(): LanguageContextValue | null {
  return useContext(LanguageContext);
}

/**
 * Idioma de UI alineado con i18n (`LanguageProvider` hace `changeLanguage` al guardar en AsyncStorage).
 * Para módulos sin React (p. ej. `ActionController`) cuando se abren paneles y toasts.
 */
export function getCurrentI18nAppLanguage(): AppLanguage {
  const raw = String(i18n.resolvedLanguage || i18n.language || 'en');
  const code = raw.split(/[-_]/)[0]?.toLowerCase() ?? 'en';
  if (isAppLanguage(code)) return code;
  return 'en';
}

export function trAction(es: string, en: string): string {
  return translateUiEsEnPair(es, en, getCurrentI18nAppLanguage());
}
