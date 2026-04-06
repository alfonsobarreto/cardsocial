/**
 * Amplía la query del Social Market con equivalentes ES/EN (p. ej. nails ↔ uñas).
 * Los tokens se normalizan igual que deepSearch (tildes, mayúsculas).
 */

import { normalizeSearchQuery } from '@/services/deepSearch';

/** Grupos de sinónimos; si aparece cualquier término del grupo, se añaden todos al set. */
const SYNONYM_GROUPS: string[][] = [
  ['nails', 'uñas', 'unas', 'manicura', 'manicure', 'nail', 'manicurist', 'manicurista'],
  [
    'hair',
    'pelo',
    'cabello',
    'peluqueria',
    'peluquería',
    'barber',
    'barberia',
    'barbería',
    'barbershop',
    'estilista',
    'esthetic',
    'estetica',
    'estética',
    'spa',
  ],
  ['cosmetology', 'cosmetologia', 'cosmetología', 'esthetic', 'estetica', 'estética', 'spa', 'facial'],
  ['web', 'website', 'pagina', 'página', 'sitio', 'developer', 'desarrollo', 'diseño', 'diseno'],
  ['lawyer', 'abogado', 'abogada', 'legal', 'leyes'],
  ['dentist', 'dentista', 'dental', 'odontologia', 'odontología'],
  ['vet', 'veterinario', 'veterinaria', 'mascota'],
  ['gym', 'gimnasio', 'fitness', 'entrenador'],
  ['bank', 'banco', 'banking', 'banca', 'finanzas', 'finance', 'financial', 'financiero'],
];

/**
 * Devuelve una cadena con todos los tokens originales + sinónimos (normalizados, únicos).
 */
export function buildExpandedMarketQuery(raw: string): string {
  const base = normalizeSearchQuery(raw);
  if (!base) {
    return '';
  }
  const tokens = new Set(base.split(/\s+/).filter(Boolean));
  for (const group of SYNONYM_GROUPS) {
    const norms = group.map((w) => normalizeSearchQuery(w)).filter(Boolean);
    if (norms.some((n) => tokens.has(n))) {
      norms.forEach((n) => tokens.add(n));
    }
  }
  return [...tokens].join(' ');
}
