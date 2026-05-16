import coreLocales from '@/services/i18n/coreLocales.json';
import { getCurrentI18nAppLanguage, type AppLanguage, useLanguageOptional } from '@/services/language';
import { useCallback } from 'react';

type LangRow = { es: string; en: string; it: string; pt: string; fr: string; de: string };

export type CoreLocaleKey = keyof typeof coreLocales;

export function coreT(
  key: CoreLocaleKey,
  lang: AppLanguage,
  vars?: Record<string, string | number>,
): string {
  const row = coreLocales[key] as LangRow | undefined;
  if (!row) return String(key);
  let s = row[lang] ?? row.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{{${k}}}`).join(String(v));
    }
  }
  return s;
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
