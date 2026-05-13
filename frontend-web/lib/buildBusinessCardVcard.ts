import type { CardData } from '@/lib/universalCardTypes';

/** Verde del botón “teléfono” estilo Contactos (iOS). */
export const CONTACTS_PHONE_GREEN = '#34C759';

function escapeVcard3Text(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function asciiFilenamePart(value: string): string {
  const t = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return t || 'contact';
}

/**
 * vCard 3.0 para importar en Contactos (sin base64).
 * N: apellidos (título tarjeta); nombre (bcContactName). URL = página pública.
 */
export function buildBusinessCardVcardBody(card: CardData, canonicalPageUrl: string): string {
  const given = String(card.bcContactName || '').trim();
  const family = String(card.scName || '').trim();
  const fnRaw = [given, family].filter(Boolean).join(' ').trim();
  const fn = fnRaw || family || given || 'Card-Social';

  const nFamily = family || '-';
  const nGiven = given || '-';

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVcard3Text(fn)}`,
    `N:${escapeVcard3Text(nFamily)};${escapeVcard3Text(nGiven)};;;`,
    `URL:${canonicalPageUrl.trim()}`,
  ];

  const photo = String(card.cardWireframeImageUrl || '').trim();
  if (photo && /^https?:\/\//i.test(photo)) {
    lines.push(`PHOTO;VALUE=URI:${photo}`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function businessCardVcardFilename(card: CardData): string {
  const base = asciiFilenamePart([String(card.bcContactName || '').trim(), String(card.scName || '').trim()].filter(Boolean).join('-'));
  return `${base}.vcf`;
}
