/**
 * Misma prioridad que `renderWireframeMiniIcon` / vault en la app:
 * URL en `icon` → imagen; si no, nombre Material en `icon` o `iconName` (catálogo Esenciales MDI);
 * si no coincide, ayuda; si no hay nombre, tipo de slot → SVG legacy.
 */

import {
  CARD_STUDIO_FALLBACK_ICON_DEF,
  resolveCardStudioFreeIconDef,
} from '@/lib/cardStudioFreeIconPaths';
import { getSlotIcon, type SlotIconDef } from '@/lib/slotIcons';

export type PublicSlotLike = {
  type?: string;
  label?: string;
  value?: string;
  icon?: string | null;
  iconName?: string | null;
};

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

function materialGlyphCandidates(slot: PublicSlotLike): string[] {
  const iconRaw = String(slot.icon || '').trim();
  const isHttp = /^https?:\/\//i.test(iconRaw);
  const fromIcon = !isHttp && iconRaw ? iconRaw : '';
  const fromIconName = String(slot.iconName || '').trim();
  return [fromIcon, fromIconName].filter(Boolean);
}

export function resolveSlotVisual(slot: PublicSlotLike): { kind: 'url'; url: string } | { kind: 'svg'; def: SlotIconDef } {
  const rawIcon = String(slot.icon || '').trim();
  if (/^https?:\/\//i.test(rawIcon)) {
    return { kind: 'url', url: rawIcon };
  }
  for (const cand of materialGlyphCandidates(slot)) {
    const def = resolveCardStudioFreeIconDef(cand);
    if (def) return { kind: 'svg', def };
  }
  if (materialGlyphCandidates(slot).length > 0) {
    return { kind: 'svg', def: CARD_STUDIO_FALLBACK_ICON_DEF };
  }
  return { kind: 'svg', def: getSlotIcon(slotTypeToIconKey(String(slot.type || 'link'))) };
}
