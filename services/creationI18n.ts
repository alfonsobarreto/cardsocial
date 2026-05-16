import creationLocales from '@/services/i18n/creationLocales.json';
import { getCurrentI18nAppLanguage, type AppLanguage, useLanguageOptional } from '@/services/language';
import { useCallback } from 'react';

type LangRow = { es: string; en: string; it: string; pt: string; fr: string; de: string };

export type CreationLocaleKey = keyof typeof creationLocales;

export function creationT(key: CreationLocaleKey, lang: AppLanguage, vars?: Record<string, string | number>): string {
  const row = creationLocales[key] as LangRow | undefined;
  if (!row) return String(key);
  let s = row[lang] ?? row.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{{${k}}}`).join(String(v));
    }
  }
  return s;
}

/** Creación / Bóveda / Card-studio dentro de `LanguageProvider`. */
export function useCreationT(): (key: CreationLocaleKey, vars?: Record<string, string | number>) => string {
  const ctx = useLanguageOptional();
  const lang = ctx?.language ?? getCurrentI18nAppLanguage();
  return useCallback((key: CreationLocaleKey, vars?: Record<string, string | number>) => creationT(key, lang, vars), [lang]);
}
