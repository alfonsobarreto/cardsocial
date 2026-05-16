/**
 * Traducciones de correo (Resend / Next API). Seis idiomas alineados con `MachineErrorLocale`.
 * En rutas API usar `emailT(locale, key, vars)` — no es un hook de React.
 */

import emailLocales from './i18n/emailLocales.json';
import type { MachineErrorLocale } from './machineErrorCatalog';

export type EmailLocale = MachineErrorLocale;

type LangRow = Record<EmailLocale, string>;

const catalog = emailLocales as Record<string, LangRow>;

export function emailT(
  locale: EmailLocale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const row = catalog[String(key)];
  if (!row) return String(key);
  let s = row[locale] ?? row.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{{${k}}}`).join(String(v));
    }
  }
  return s;
}

/** Alias explícito para quien busque un nombre tipo “use*”; misma función que `emailT`. */
export const useEmailT = emailT;

export function normalizeEmailLocaleFromBodyOrHeaders(
  rawBodyLocale: string | undefined | null,
  headers: Headers,
  pickLocale: (h: Headers) => MachineErrorLocale,
): EmailLocale {
  const b = String(rawBodyLocale || '').trim().toLowerCase();
  if (b === 'es' || b === 'en' || b === 'it' || b === 'fr' || b === 'de' || b === 'pt') {
    return b;
  }
  return pickLocale(headers);
}
