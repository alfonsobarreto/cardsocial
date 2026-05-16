import authLocales from '@/services/i18n/authLocales.json';
import { getCurrentI18nAppLanguage, type AppLanguage, useLanguageOptional } from '@/services/language';
import { useCallback } from 'react';

type LangRow = { es: string; en: string; it: string; pt: string; fr: string; de: string };

export type AuthLocaleKey = keyof typeof authLocales;

export function authT(key: AuthLocaleKey, lang: AppLanguage, vars?: Record<string, string | number>): string {
  const row = authLocales[key] as LangRow | undefined;
  if (!row) return String(key);
  let s = row[lang] ?? row.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{{${k}}}`).join(String(v));
    }
  }
  return s;
}

/** Hook for auth/register/profile-security screens inside `LanguageProvider`. */
export function useAuthT(): (key: AuthLocaleKey, vars?: Record<string, string | number>) => string {
  const ctx = useLanguageOptional();
  const lang = ctx?.language ?? getCurrentI18nAppLanguage();
  return useCallback((key: AuthLocaleKey, vars?: Record<string, string | number>) => authT(key, lang, vars), [lang]);
}
