import coreLocales from '@/services/i18n/coreLocales.json';
import {
  APP_LANGUAGE_STORAGE_KEY,
  getCurrentI18nAppLanguage,
  isAppLanguage,
  translateUiEsEnPair,
  type AppLanguage,
  useLanguageOptional,
} from '@/services/language';
import { useCallback } from 'react';

export { APP_LANGUAGE_STORAGE_KEY, isAppLanguage };
export type { AppLanguage };

type LangRow = { es: string; en: string; it: string; pt: string; fr: string; de: string };

export type CoreLocaleKey = keyof typeof coreLocales;

function isUsableCoreLocaleString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Idioma solicitado → inglés obligatorio → clave visible (nunca cadena vacía en UI). */
function resolveCoreLocaleString(row: LangRow, lang: AppLanguage, key: string): string {
  const primary = row[lang];
  if (isUsableCoreLocaleString(primary)) return primary;
  const en = row.en;
  if (isUsableCoreLocaleString(en)) return en;
  return String(key);
}

export function coreT(
  key: CoreLocaleKey,
  lang: AppLanguage,
  vars?: Record<string, string | number>,
): string {
  const row = coreLocales[key] as LangRow | undefined;
  if (!row) return String(key);
  let s = resolveCoreLocaleString(row, lang, String(key));
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{{${k}}}`).join(String(v));
    }
  }
  return s;
}

/** Pares (es, en) de catálogo o UI → i18n `ui.x{hash}` + extras CMS (mismo pipeline que `translateUiEsEnPair`). */
export function coreTrEsEn(es: string, en: string, lang: AppLanguage): string {
  return translateUiEsEnPair(es, en, lang);
}

export function useAppLanguage(): AppLanguage {
  const ctx = useLanguageOptional();
  return ctx?.language ?? getCurrentI18nAppLanguage();
}

/** Hook for cards / contacts / search / calls and shared modals under `LanguageProvider`. */
export function useCoreT(): (key: CoreLocaleKey, vars?: Record<string, string | number>) => string {
  const ctx = useLanguageOptional();
  const lang = ctx?.language ?? getCurrentI18nAppLanguage();
  return useCallback(
    (key: CoreLocaleKey, vars?: Record<string, string | number>) => coreT(key, lang, vars),
    [lang],
  );
}
