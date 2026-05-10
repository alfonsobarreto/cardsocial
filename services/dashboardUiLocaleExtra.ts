import type { AppLanguage } from '@/services/language';
import { hashUiPair } from '@/services/uiStringHash';

import extra from './dashboard-ui-extra.json';

type TierLang = Exclude<AppLanguage, 'en' | 'es'>;

/** Traducciones del dashboard (de/fr/it/pt) indexadas por hashUiPair(es, en). */
export function dashboardUiLocaleExtra(es: string, en: string, lang: AppLanguage): string | null {
  if (lang === 'en' || lang === 'es') return null;
  const h = hashUiPair(es, en);
  const row = (extra as Record<string, Partial<Record<TierLang, string>>>)[h];
  if (!row) return null;
  const t = row[lang as TierLang];
  return typeof t === 'string' && t.length > 0 ? t : null;
}
