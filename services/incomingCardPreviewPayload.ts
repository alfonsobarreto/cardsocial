/**
 * Construye el payload del modal de vista previa al aceptar una tarjeta entrante
 * (token universal / QR dinámico), misma forma que Contactos / Mis Tarjetas.
 * Identidad siempre desde objeto raíz (`CanonicalIssuerIdentity`), no campos sueltos.
 */

import type { WireframeEditSlot } from '@/components/smartCard/IsolatedWireframeCard';
import type { MyCardsPayload } from '@/components/MyCards/MyCardsPreviewModal';
import { publicSlotToMirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import type { PublicCardSlotPayload, PublicQrTokenPreview, PublicUniversalCardPayload } from '@/services/qrApi';
import { toRenderableImageUri } from '@/services/userProfilePhoto';
import {
  buildCanonicalIssuerIdentityFromPublicUniversalCard,
  buildCanonicalIssuerIdentityFromQrPreview,
} from '@/types/canonicalIssuerIdentity';

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
  const idn = buildCanonicalIssuerIdentityFromPublicUniversalCard(card);
  const nick = String(idn.userNickName || '').trim();
  const cardNm = String(card.scName || '').trim();
  const person = String(idn.userFullName || '').trim();
  const occ = String(card.ownerOccupation || '').trim();
  const subtitle = nick ? (nick.startsWith('@') ? nick : `@${nick}`) : '';
  const slotRows = Array.isArray(card.slots) ? (card.slots as unknown as PublicCardSlotPayload[]) : [];
  return {
    cardName: (cardNm || person || occ || tr('Tarjeta Social', 'Social Card')).trim(),
    subtitle,
    avatarUrl: idn.userAvatarUrl,
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
  const idn = buildCanonicalIssuerIdentityFromQrPreview(p);
  const nick = String(idn.userNickName || '').trim();
  const cardNm = String(p.cardName || '').trim();
  const person = String(idn.userFullName || '').trim();
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
  const layout = p.layout === 'horizontal' ? 'horizontal' : 'vertical';
  const themeId = String(p.themeId || '').trim();
  /** Business cards: círculo = logo en doc de tarjeta (`ownerPhotoUrl`, p. ej. `bcLogoUrl`); nunca `userAvatarUrl` de persona. */
  const isBusiness = String(p.bId || '').trim() !== '';
  const businessLogoRaw = String(p.ownerPhotoUrl ?? '').trim();
  const circleAvatarUrl = isBusiness
    ? toRenderableImageUri(businessLogoRaw || undefined) || businessLogoRaw || null
    : idn.userAvatarUrl;
  const subtitleOut = isBusiness
    ? String(p.ownerDisplayName || p.cardName || '').trim() || subtitle
    : subtitle;
  return {
    cardName: (cardNm || person || occ || tr('Tarjeta Social', 'Social Card')).trim(),
    subtitle: subtitleOut,
    avatarUrl: circleAvatarUrl,
    themeId,
    layout,
    wallpaperUrl: p.wallpaperUrl,
    holdersCount: Math.max(0, Math.floor(Number(p.holdersCount ?? 0))),
    ratingAvg: Number.isFinite(Number(p.ratingAvg)) ? Number(p.ratingAvg) : 0,
    totalRatings: Math.max(0, Math.floor(Number(p.totalRatings ?? 0))),
    enableParallax: Boolean(p.enableParallax),
    slots: slotsToWireframeSlots(slotRows),
    ...(isBusiness ? { noAvatarIcon: 'storefront-outline' as const } : {}),
  };
}
