import { useCallback, useMemo } from 'react';

import adminLocales from './adminLocales.json';

export type AdminLocale = 'es' | 'en';

type CatalogRow = Record<AdminLocale, string>;
const catalog = adminLocales as Record<string, CatalogRow>;

/** Idioma del navegador del empleado: español vs inglés, resto → EN. */
export function detectAdminLocale(): AdminLocale {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language?.toLowerCase() ?? '';
  return lang.startsWith('es') ? 'es' : 'en';
}

export function adminT(locale: AdminLocale, key: string, vars?: Record<string, string | number>): string {
  const row = catalog[key];
  if (!row) return key;
  let s = row[locale] ?? row.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{{${k}}}`).join(String(v));
    }
  }
  return s;
}

/** Resuelve textos del panel admin según el idioma del navegador. */
export function useAdminT(): { t: (key: string, vars?: Record<string, string | number>) => string; locale: AdminLocale } {
  const locale = useMemo(() => detectAdminLocale(), []);
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars),
    [locale],
  );
  return { t, locale };
}
