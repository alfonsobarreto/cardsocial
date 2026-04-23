/**
 * Idioma de la web pública (tarjetas /u/ y /b/):
 * - Español solo cuando el primer tag de `Accept-Language` es `es` (es-ES, es-MX, …).
 * - **Cualquier otro idioma** (zh, de, fr, en, vacío, etc.) → **inglés** (fallback producto en USA).
 * Alineado con `backend/src/lib/httpRequestLocale.js`.
 * Orden: query `?lang=es` | `?lang=en`, luego `Accept-Language` (navegador / sistema).
 */
export type PublicLocale = 'es' | 'en';

export function acceptLanguageToLocale(acceptLanguage: string | null | undefined): PublicLocale {
  const first = String(acceptLanguage || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return first.startsWith('es') ? 'es' : 'en';
}

type SearchParams = Record<string, string | string[] | undefined> | null | undefined;

function queryLang(sp: SearchParams): PublicLocale | null {
  if (!sp) return null;
  const raw = sp.lang;
  const v = (Array.isArray(raw) ? raw[0] : raw) || '';
  const p = String(v).trim().toLowerCase();
  if (p === 'es' || p === 'en') return p;
  return null;
}

export function resolvePublicLocale(input: { searchParams: SearchParams; acceptLanguage: string | null }): PublicLocale {
  const fromQuery = queryLang(input.searchParams);
  if (fromQuery) return fromQuery;
  return acceptLanguageToLocale(input.acceptLanguage);
}
