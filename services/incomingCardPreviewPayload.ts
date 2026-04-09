/**
 * Construye el payload del modal de vista previa al aceptar una tarjeta entrante
 * (token universal / QR dinámico), misma forma que Contactos / Mis Tarjetas.
 */

import type { WireframeEditSlot } from '@/components/smartCard/IsolatedWireframeCard';
import type { MyCardsPayload } from '@/components/MyCards/MyCardsPreviewModal';
import { publicSlotToMirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import type { PublicCardSlotPayload, PublicQrTokenPreview, PublicUniversalCardPayload } from '@/services/qrApi';

function slotsToWireframeSlots(slots: PublicCardSlotPayload[]): WireframeEditSlot[] {
  const items = slots.map((s) => publicSlotToMirrorVaultItem(s));
  return items.map((item, index) => ({
    id: `incoming-${item.id}-${index}`,
    index,
    item,
  }));
}

export function myCardsPayloadFromUniversalCard(
  card: PublicUniversalCardPayload,
  tr: (es: string, en: string) => string,
): MyCardsPayload {
  const nick = String(card.ownerNickname || '').trim();
  const cardNm = String(card.name || '').trim();
  const person = String(card.ownerDisplayName || '').trim();
  const occ = String(card.ownerOccupation || '').trim();
  const subtitle = nick ? (nick.startsWith('@') ? nick : `@${nick}`) : '';
  const slotRows = Array.isArray(card.slots) ? (card.slots as unknown as PublicCardSlotPayload[]) : [];
  return {
    cardName: (cardNm || person || occ || tr('Tarjeta Social', 'Social Card')).trim(),
    subtitle,
    avatarUrl: card.ownerPhotoUrl,
    themeId: card.themeId || '',
    wallpaperUrl: card.wallpaperUrl ?? undefined,
    layout: card.layout === 'horizontal' ? 'horizontal' : 'vertical',
    holdersCount: Math.max(0, Math.floor(Number(card.holdersCount ?? 0))),
    ratingAvg: Number(card.ratingAvg),
    totalRatings: Math.max(0, Math.floor(Number(card.totalRatings ?? 0))),
    enableParallax: Boolean(card.enableParallax),
    slots: slotsToWireframeSlots(slotRows),
  };
}

export function myCardsPayloadFromQrPreview(
  p: PublicQrTokenPreview,
  tr: (es: string, en: string) => string,
): MyCardsPayload {
  const nick = String(p.ownerNickname || '').trim();
  const cardNm = String(p.cardName || '').trim();
  const person = String(p.ownerDisplayName || '').trim();
  const occ = String(p.ownerOccupation || '').trim();
  const subtitle = nick ? (nick.startsWith('@') ? nick : `@${nick}`) : '';
  const raw = Array.isArray(p.slots) ? p.slots : [];
  const slotRows: PublicCardSlotPayload[] = raw.map((s, i) => ({
    itemId: String(s.itemId || '').trim() || `slot-${i}`,
    type: s.type,
    label: s.label,
    value: s.value,
    iconName: s.iconName,
    icon: s.icon,
    vaultMimeType: s.vaultMimeType,
  }));
  return {
    cardName: (cardNm || person || occ || tr('Tarjeta Social', 'Social Card')).trim(),
    subtitle,
    avatarUrl: p.ownerPhotoUrl,
    themeId: '',
    layout: 'vertical',
    holdersCount: 0,
    ratingAvg: 0,
    totalRatings: 0,
    enableParallax: false,
    slots: slotsToWireframeSlots(slotRows),
  };
}
