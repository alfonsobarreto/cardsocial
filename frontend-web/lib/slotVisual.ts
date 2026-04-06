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
    email: 'email',
    telegram: 'telegram',
    snapchat: 'snapchat',
    tiktok: 'tiktok',
    web: 'website',
    linkvariant: 'website',
    earth: 'website',
    mapmarker: 'location',
    account: 'default',
  };
  return alias[raw] || raw;
}

export function resolveSlotVisual(slot: PublicSlotLike): { kind: 'url'; url: string } | { kind: 'svg'; def: SlotIconDef } {
  const rawIcon = String(slot.icon || '').trim();
  if (/^https?:\/\//i.test(rawIcon)) {
    return { kind: 'url', url: rawIcon };
  }
  if (slot.iconName && String(slot.iconName).trim()) {
    return { kind: 'svg', def: getSlotIcon(iconNameToTypeKey(String(slot.iconName))) };
  }
  return { kind: 'svg', def: getSlotIcon(String(slot.type || 'link')) };
}
