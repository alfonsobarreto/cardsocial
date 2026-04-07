/**
 * Misma prioridad que `renderWireframeMiniIcon` en la app: URL → imagen; si no, iconName / tipo → SVG.
 */

import { getSlotIcon, type SlotIconDef } from '@/lib/slotIcons';

export type PublicSlotLike = {
  type?: string;
  label?: string;
  value?: string;
  icon?: string | null;
  iconName?: string | null;
};

/** Normaliza nombres tipo MaterialCommunityIcons → clave de mapa de tipos. */
function iconNameToTypeKey(iconName: string): string {
  const raw = String(iconName || '')
    .trim()
    .toLowerCase()
    .replace(/^mdi-/, '')
    .replace(/-/g, '');
  const alias: Record<string, string> = {
    youtubese: 'youtube',
    youtubeplay: 'youtube',
    linkedin: 'linkedin',
    instagram: 'instagram',
    twitter: 'twitter',
    facebook: 'facebook',
    whatsapp: 'whatsapp',
    phone: 'phone',
    phoneintalk: 'phone',
    phonevoip: 'voip',
    phoneclassic: 'phone',
    phonelock: 'phone',
    phonelog: 'phone',
    phoneincomingoutgoing: 'phone',
    cellphone: 'phone',
    cellphonebasic: 'phone',
    cellphoneiphone: 'phone',
    cellphonekey: 'phone',
    cellphonemessage: 'phone',
    cellphoneoff: 'phone',
    cellphoneplay: 'phone',
    cellphonesound: 'phone',
    email: 'email',
    telegram: 'telegram',
    snapchat: 'snapchat',
    tiktok: 'tiktok',
    web: 'website',
    linkvariant: 'website',
    earth: 'website',
    mapmarker: 'location',
    account: 'default',
    cardtext: 'link',
    filedocument: 'link',
    filedocumentoutline: 'link',
    certificate: 'link',
    presentation: 'link',
    gmail: 'email',
  };
  return alias[raw] || raw;
}

/** Tipo de slot de la API (p. ej. ghost-link, ghost-link-voip) → clave SVG. */
function slotTypeToIconKey(type: string): string {
  const t = String(type || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  const alpha = t.replace(/[^a-z]/g, '');
  if (t.includes('voip') || alpha.includes('ghostlink')) {
    return 'voip';
  }
  if (t.includes('telefono') || t.includes('telephone') || t === 'phone' || t === 'movil' || t === 'mobile') {
    return 'phone';
  }
  if (t.includes('email') || t.includes('correo')) {
    return 'email';
  }
  return String(type || 'link');
}

export function resolveSlotVisual(slot: PublicSlotLike): { kind: 'url'; url: string } | { kind: 'svg'; def: SlotIconDef } {
  const rawIcon = String(slot.icon || '').trim();
  if (/^https?:\/\//i.test(rawIcon)) {
    return { kind: 'url', url: rawIcon };
  }
  if (slot.iconName && String(slot.iconName).trim()) {
    return { kind: 'svg', def: getSlotIcon(iconNameToTypeKey(String(slot.iconName))) };
  }
  return { kind: 'svg', def: getSlotIcon(slotTypeToIconKey(String(slot.type || 'link'))) };
}
