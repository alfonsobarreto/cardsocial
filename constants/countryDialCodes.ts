/**
 * Códigos de marcación internacional para selector de teléfono (registro, Búnker).
 * Nombres en inglés para consistencia; límites = dígitos nacionales (sin prefijo +).
 */

export type CountryDialEntry = {
  id: string;
  code: string;
  country: string;
  minDigits: number;
  maxDigits: number;
};

/** Prioridad estratégica (sección "Top"). */
export const COUNTRY_DIAL_TOP: CountryDialEntry[] = [
  { id: 'top-us', code: '+1', country: 'USA / Canada', minDigits: 10, maxDigits: 10 },
  { id: 'top-mx', code: '+52', country: 'Mexico', minDigits: 10, maxDigits: 10 },
  { id: 'top-pe', code: '+51', country: 'Peru', minDigits: 9, maxDigits: 9 },
  { id: 'top-fr', code: '+33', country: 'France', minDigits: 9, maxDigits: 9 },
  { id: 'top-it', code: '+39', country: 'Italy', minDigits: 9, maxDigits: 10 },
  { id: 'top-br', code: '+55', country: 'Brazil', minDigits: 10, maxDigits: 11 },
  { id: 'top-pt', code: '+351', country: 'Portugal', minDigits: 9, maxDigits: 9 },
];

const TOP_CODES = new Set(COUNTRY_DIAL_TOP.map((e) => e.code));

/**
 * Resto del mundo (sin códigos duplicados respecto a Top).
 * Eliminados por completo: Nigeria +234, Turkey +90, Saudi Arabia +966, UAE +971.
 * Añadidos: Vietnam +84, Indonesia +62. Portugal +351 solo en Top (no duplicado abajo).
 */
const REST_SEED: Omit<CountryDialEntry, 'id'>[] = [
  { code: '+54', country: 'Argentina', minDigits: 10, maxDigits: 10 },
  { code: '+61', country: 'Australia', minDigits: 9, maxDigits: 9 },
  { code: '+591', country: 'Bolivia', minDigits: 8, maxDigits: 8 },
  { code: '+56', country: 'Chile', minDigits: 9, maxDigits: 9 },
  { code: '+86', country: 'China', minDigits: 11, maxDigits: 11 },
  { code: '+57', country: 'Colombia', minDigits: 10, maxDigits: 10 },
  { code: '+506', country: 'Costa Rica', minDigits: 8, maxDigits: 8 },
  { code: '+593', country: 'Ecuador', minDigits: 9, maxDigits: 9 },
  { code: '+503', country: 'El Salvador', minDigits: 8, maxDigits: 8 },
  { code: '+34', country: 'Spain', minDigits: 9, maxDigits: 9 },
  { code: '+49', country: 'Germany', minDigits: 10, maxDigits: 11 },
  { code: '+502', country: 'Guatemala', minDigits: 8, maxDigits: 8 },
  { code: '+91', country: 'India', minDigits: 10, maxDigits: 10 },
  { code: '+62', country: 'Indonesia', minDigits: 9, maxDigits: 12 },
  { code: '+81', country: 'Japan', minDigits: 10, maxDigits: 10 },
  { code: '+63', country: 'Philippines', minDigits: 10, maxDigits: 10 },
  { code: '+7', country: 'Russia / Kazakhstan', minDigits: 10, maxDigits: 10 },
  { code: '+27', country: 'South Africa', minDigits: 9, maxDigits: 9 },
  { code: '+82', country: 'South Korea', minDigits: 9, maxDigits: 11 },
  { code: '+66', country: 'Thailand', minDigits: 9, maxDigits: 9 },
  { code: '+58', country: 'Venezuela', minDigits: 10, maxDigits: 10 },
  { code: '+84', country: 'Vietnam', minDigits: 9, maxDigits: 9 },
  { code: '+595', country: 'Paraguay', minDigits: 9, maxDigits: 9 },
  { code: '+598', country: 'Uruguay', minDigits: 8, maxDigits: 8 },
  { code: '+507', country: 'Panama', minDigits: 8, maxDigits: 8 },
  { code: '+44', country: 'United Kingdom', minDigits: 10, maxDigits: 10 },
];

function buildRest(): CountryDialEntry[] {
  const filtered = REST_SEED.filter((r) => !TOP_CODES.has(r.code));
  const sorted = [...filtered].sort((a, b) => a.country.localeCompare(b.country, 'en'));
  return sorted.map((r, i) => ({
    id: `rest-${r.code.replace(/\D/g, '')}-${i}`,
    ...r,
  }));
}

export const COUNTRY_DIAL_REST: CountryDialEntry[] = buildRest();

export const ALL_DIAL_ENTRIES: CountryDialEntry[] = [...COUNTRY_DIAL_TOP, ...COUNTRY_DIAL_REST];

export function getDialEntryByCode(code: string): CountryDialEntry | undefined {
  const c = code.trim();
  const sorted = [...ALL_DIAL_ENTRIES].sort((a, b) => b.code.length - a.code.length);
  return sorted.find((e) => e.code === c);
}

export function getNationalDigitBounds(code: string): { min: number; max: number } {
  const e = getDialEntryByCode(code);
  if (!e) return { min: 8, max: 15 };
  return { min: e.minDigits, max: e.maxDigits };
}

export function sanitizeNationalDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function parsePhoneIntoDialAndNational(full: string): { dial: string; national: string } {
  const trimmed = full.trim();
  if (!trimmed.startsWith('+')) {
    return { dial: '+1', national: sanitizeNationalDigits(trimmed) };
  }
  const compact = trimmed.replace(/\s/g, '');
  const sorted = [...ALL_DIAL_ENTRIES].sort((a, b) => b.code.length - a.code.length);
  for (const e of sorted) {
    if (compact.startsWith(e.code)) {
      const national = sanitizeNationalDigits(compact.slice(e.code.length));
      return { dial: e.code, national };
    }
  }
  return { dial: '+1', national: sanitizeNationalDigits(compact) };
}

export function buildE164(dial: string, nationalDigits: string): string {
  return `${dial}${sanitizeNationalDigits(nationalDigits)}`;
}

function entryMatchesQuery(entry: CountryDialEntry, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if (entry.country.toLowerCase().includes(s)) return true;
  const codeNorm = entry.code.toLowerCase().replace(/\s/g, '');
  if (codeNorm.includes(s.replace(/\s/g, ''))) return true;
  const digitsQ = s.replace(/\D/g, '');
  if (digitsQ.length > 0 && entry.code.replace(/\D/g, '').includes(digitsQ)) return true;
  return false;
}

export function filterDialEntries(entries: CountryDialEntry[], query: string): CountryDialEntry[] {
  if (!query.trim()) return entries;
  return entries.filter((e) => entryMatchesQuery(e, query));
}
