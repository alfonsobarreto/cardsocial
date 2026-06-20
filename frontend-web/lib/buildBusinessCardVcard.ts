import type { CardData } from '@/lib/universalCardTypes';

/** Verde del botón “teléfono” estilo Contactos (iOS). */
export const CONTACTS_PHONE_GREEN = '#34C759';

/**
 * iOS/Android a menudo ignoran PHOTO con URI remota (sin datos embebidos).
 * Poner `true` para probar URL absoluta + TYPE + folding RFC; si sigue vacío en Contactos, dejar `false`.
 */
export const USE_REMOTE_LOGO_IN_VCARD = false;

const NOTE_MAX_CHARS = 1900;

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

function noteFromBcKeywords(card: CardData): string | null {
  const raw = card.bcKeywords;
  if (!raw?.length) return null;
  const text = raw
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .join(', ')
    .trim();
  if (!text) return null;
  return text.length > NOTE_MAX_CHARS ? `${text.slice(0, NOTE_MAX_CHARS - 1)}…` : text;
}

/** Resuelve rutas relativas o protocol-relative respecto a la página de la tarjeta. */
function absolutizeHttpsUrl(raw: string, canonicalPageUrl: string): string | null {
  const u = String(raw ?? '').trim();
  if (!u) return null;
  if (u.startsWith('//')) {
    try {
      const out = new URL(`https:${u}`).href;
      return out.startsWith('https:') ? out : null;
    } catch {
      return null;
    }
  }
  if (/^https:\/\//i.test(u)) return u;
  try {
    const resolved = new URL(u, canonicalPageUrl).href;
    return /^https:\/\//i.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function photoTypeFromUrl(url: string): 'JPEG' | 'PNG' | 'GIF' {
  const lower = url.split('?')[0]?.toLowerCase() ?? '';
  if (lower.endsWith('.png')) return 'PNG';
  if (lower.endsWith('.gif')) return 'GIF';
  return 'JPEG';
}

/** RFC 2426: líneas físicas ≤ 75 octets; continuaciones empiezan con espacio. */
function foldVcardLine(line: string): string {
  const max = 75;
  const encoder = new TextEncoder();
  const nbytes = encoder.encode(line).length;
  if (nbytes <= max) return line;

  const parts: string[] = [];
  let rest = line;
  let first = true;

  while (rest.length > 0) {
    const budget = first ? max : max - 1;
    let take = 0;
    let used = 0;
    for (let i = 0; i < rest.length; i++) {
      const seg = rest[i]!;
      const n = encoder.encode(seg).length;
      if (used + n > budget) break;
      used += n;
      take = i + 1;
    }
    if (take === 0) take = 1;
    const chunk = rest.slice(0, take);
    rest = rest.slice(take);
    if (first) {
      parts.push(chunk);
      first = false;
    } else {
      parts.push(` ${chunk}`);
    }
  }

  return parts.join('\r\n');
}

/**
 * vCard 3.0 para importar en Contactos (sin base64 en foto).
 * N: apellidos (título tarjeta); nombre (bcContactName). URL = página pública. NOTE = bcKeywords.
 */
export function buildBusinessCardVcardBody(card: CardData, canonicalPageUrl: string): string {
  const given = String(card.bcContactName || '').trim();
  const family = String(card.scName || '').trim();
  const fnRaw = [given, family].filter(Boolean).join(' ').trim();
  const fn = fnRaw || family || given || 'Card-Social';

  const nFamily = family || '-';
  const nGiven = given || '-';

  const logicalLines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVcard3Text(fn)}`,
    `N:${escapeVcard3Text(nFamily)};${escapeVcard3Text(nGiven)};;;`,
    `URL:${canonicalPageUrl.trim()}`,
  ];

  const note = noteFromBcKeywords(card);
  if (note) {
    logicalLines.push(`NOTE:${escapeVcard3Text(note)}`);
  }

  if (USE_REMOTE_LOGO_IN_VCARD) {
    const rawPhoto = String(card.cardWireframeImageUrl || '').trim();
    const photoAbs = absolutizeHttpsUrl(rawPhoto, canonicalPageUrl.trim());
    if (photoAbs) {
      const t = photoTypeFromUrl(photoAbs);
      logicalLines.push(`PHOTO;TYPE=${t};VALUE=URI:${photoAbs}`);
    }
  }

  logicalLines.push('END:VCARD');

  return logicalLines.map(foldVcardLine).join('\r\n');
}

export function businessCardVcardFilename(card: CardData): string {
  const base = asciiFilenamePart(
    [String(card.bcContactName || '').trim(), String(card.scName || '').trim()].filter(Boolean).join('-'),
  );
  return `${base}.vcf`;
}

function slotTypeKey(type: string | null | undefined): string {
  return String(type || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function isPhoneSlotType(type: string | null | undefined): boolean {
  const k = slotTypeKey(type);
  if (!k || k.includes('voip')) return false;
  if (['telefono', 'telephone', 'phone', 'movil', 'mobile', 'cell', 'celular'].includes(k)) return true;
  return k.includes('telefono') || k.includes('telephone') || k.includes('phone');
}

function isEmailSlotType(type: string | null | undefined): boolean {
  const k = slotTypeKey(type);
  if (!k) return false;
  if (k === 'email' || k === 'correo' || k === 'mail') return true;
  return k.includes('email') || k.includes('correo') || k.includes('mail');
}

function appendPublicSlotContactLines(logicalLines: string[], card: CardData): void {
  const seen = new Set<string>();
  for (const slot of card.slots || []) {
    const value = String(slot.value || '').trim();
    if (!value) continue;
    const dedupe = `${String(slot.type || '')}:${value}`.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    if (isPhoneSlotType(slot.type)) {
      logicalLines.push(`TEL;TYPE=CELL:${escapeVcard3Text(value)}`);
    } else if (isEmailSlotType(slot.type)) {
      logicalLines.push(`EMAIL;TYPE=INTERNET:${escapeVcard3Text(value)}`);
    }
  }
}

/**
 * vCard 3.0 para smart card universal (`/u/…`).
 * FN = persona; N = tarjeta + persona; slots públicos → TEL/EMAIL.
 */
export function buildUniversalCardVcardBody(card: CardData, canonicalPageUrl: string): string {
  const cardTitle = String(card.scName || '').trim();
  const person =
    String(card.userFullName || '').trim() ||
    String(card.ownerDisplayName || '').trim() ||
    String(card.ownerNickname || '').trim();
  const fnRaw = [person, cardTitle].filter(Boolean).join(' — ').trim();
  const fn = fnRaw || cardTitle || person || 'Card-Social';

  const nFamily = cardTitle || person || '-';
  const nGiven = person && person !== cardTitle ? person : '-';

  const logicalLines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVcard3Text(fn)}`,
    `N:${escapeVcard3Text(nFamily)};${escapeVcard3Text(nGiven)};;;`,
    `URL:${canonicalPageUrl.trim()}`,
  ];

  const occupation = String(card.ownerOccupation || '').trim();
  if (occupation) {
    logicalLines.push(`NOTE:${escapeVcard3Text(occupation)}`);
  }

  appendPublicSlotContactLines(logicalLines, card);

  if (USE_REMOTE_LOGO_IN_VCARD) {
    const rawPhoto = String(card.cardWireframeImageUrl || card.userAvatarUrl || '').trim();
    const photoAbs = absolutizeHttpsUrl(rawPhoto, canonicalPageUrl.trim());
    if (photoAbs) {
      const t = photoTypeFromUrl(photoAbs);
      logicalLines.push(`PHOTO;TYPE=${t};VALUE=URI:${photoAbs}`);
    }
  }

  logicalLines.push('END:VCARD');

  return logicalLines.map(foldVcardLine).join('\r\n');
}

export function universalCardVcardFilename(card: CardData): string {
  const base = asciiFilenamePart(
    [
      String(card.userFullName || card.ownerDisplayName || '').trim(),
      String(card.scName || '').trim(),
    ]
      .filter(Boolean)
      .join('-'),
  );
  return `${base}.vcf`;
}
