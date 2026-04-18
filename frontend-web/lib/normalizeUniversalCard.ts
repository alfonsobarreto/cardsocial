import type { CardData, PublicSlot } from '@/lib/universalCardTypes';
import { resolvePublicVaultUrlForWeb } from '@/lib/resolvePublicVaultMediaUrl';

/**
 * Asegura `card.slots` para el cliente: la API usa `slots`, pero normalizamos
 * y copiamos campos por si el JSON llega con variantes (`publicCardSlots`).
 * Reescribe URLs del vault al host público (evita HTTP / IP LAN en página HTTPS).
 */
export function normalizeUniversalCardPayload(raw: unknown): CardData {
  const c = raw as Record<string, unknown>;
  const fromSlots = Array.isArray(c?.slots) ? c.slots : null;
  const fromLegacy = Array.isArray(c?.publicCardSlots) ? c.publicCardSlots : null;
  const list = (fromSlots ?? fromLegacy ?? []) as PublicSlot[];

  const slots: PublicSlot[] = list.slice(0, 24).map((row, i) => {
    const r = row as Record<string, unknown>;
    const itemId = String(r?.itemId ?? '').trim() || `slot-${i}`;
    const type = String(r?.type ?? 'link').trim().slice(0, 64) || 'link';
    const label = String(r?.label ?? '').trim().slice(0, 200);
    const value = String(r?.value ?? '').trim().slice(0, 4000);
    const iconNameRaw = String(r?.iconName ?? '').trim();
    const iconName = iconNameRaw ? iconNameRaw.slice(0, 120) : null;
    const iconStr = String(r?.icon ?? '').trim();
    const icon = /^https?:\/\//i.test(iconStr) ? iconStr.slice(0, 4000) : null;
    const vaultMimeRaw = String(r?.vaultMimeType ?? '').trim();
    const vaultMimeType = vaultMimeRaw ? vaultMimeRaw.slice(0, 120) : null;
    return {
      itemId,
      type,
      label,
      value,
      ...(iconName ? { iconName } : {}),
      ...(icon ? { icon } : {}),
      ...(vaultMimeType ? { vaultMimeType } : {}),
    };
  });

  const merged = { ...(c as Record<string, unknown>) };
  const scName = String(merged.scName ?? '').trim();
  delete merged.name;
  merged.scName = scName;

  /** Alineado con `qrApi.normalizePublicUniversalCardPayload` / Fase D (persona vs espejo Mongo). */
  const userFullName =
    String(merged.userFullName ?? '').trim() ||
    String(merged.ownerDisplayName ?? '').trim() ||
    '';
  const userNickName =
    String(merged.userNickName ?? '').trim() ||
    String(merged.ownerNickname ?? '').trim() ||
    '';
  merged.ownerDisplayName = userFullName;
  merged.userFullName = userFullName || null;
  merged.userNickName = userNickName || null;

  /** API sigue enviando `ownerPhotoUrl`; en cliente solo `cardWireframeImageUrl` + `userAvatarUrl`. */
  const rawOwner = merged.ownerPhotoUrl;
  const rawUserAvatar = merged.userAvatarUrl;
  const rawWallpaper = merged.wallpaperUrl;
  delete merged.ownerPhotoUrl;
  delete merged.userAvatarUrl;
  delete merged.wallpaperUrl;

  const base = { ...(merged as unknown as CardData), slots };
  const cardWireframeImageUrl =
    rawOwner != null && String(rawOwner).trim()
      ? resolvePublicVaultUrlForWeb(String(rawOwner)) ?? String(rawOwner)
      : null;
  const userAvatarUrl =
    rawUserAvatar != null && String(rawUserAvatar).trim()
      ? resolvePublicVaultUrlForWeb(String(rawUserAvatar)) ?? String(rawUserAvatar)
      : null;
  const wallpaperUrl =
    rawWallpaper != null && String(rawWallpaper).trim()
      ? resolvePublicVaultUrlForWeb(String(rawWallpaper)) ?? String(rawWallpaper)
      : null;

  return {
    ...base,
    cardWireframeImageUrl,
    userAvatarUrl,
    wallpaperUrl,
  };
}
