import { useCallback } from 'react';

import adminLocales from './adminLocales.json';
import { type AdminLocale, useAdminLocale } from './AdminLocaleProvider';

export type { AdminLocale } from './AdminLocaleProvider';

type CatalogRow = Record<AdminLocale, string>;
const catalog = adminLocales as Record<string, CatalogRow>;

export function adminT(
  locale: AdminLocale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const row = catalog[key];
  if (!row) return key;
  let s = row[locale] ?? row.en ?? row.es;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{{${k}}}`).join(String(v));
    }
  }
  return s;
}

/** Resuelve textos del panel admin según el idioma elegido (persistente, ES por defecto). */
export function useAdminT(): {
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: AdminLocale;
} {
  const { locale } = useAdminLocale();
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars),
    [locale],
  );
  return { t, locale };
}
