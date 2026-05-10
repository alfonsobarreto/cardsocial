/**
 * Motor Legacy Path — tiers almacenados en Firestore `users.{legacyTier}`
 * usando umbrales 250 · 500 · 750 · 1000 (alineados con Legacy Path UI).
 */

export type LegacyTierStored = 'none' | 'silver' | 'gold' | 'platinum' | 'diamond';

const ORDER: LegacyTierStored[] = ['none', 'silver', 'gold', 'platinum', 'diamond'];

/** Techo opcional UI “alcance” (según briefing producto — no es límite de tier). */
export const LEGACY_REFERRALS_CEILING_UI = 1500;

/** Producción web: mismo host que sirve firma/embed cuando falta `.env` en el device. */
export const LEGACY_DIAMOND_RADAR_STUDIO_FALLBACK_ORIGIN =
  typeof process.env.EXPO_PUBLIC_LEGACY_RADAR_FALLBACK_ORIGIN === 'string' &&
  process.env.EXPO_PUBLIC_LEGACY_RADAR_FALLBACK_ORIGIN.trim()
    ? process.env.EXPO_PUBLIC_LEGACY_RADAR_FALLBACK_ORIGIN.trim().replace(/\/+$/, '')
    : 'https://cardsocial.me';

/** +1 sobre el tope gratuito si el usuario llegó al menos a Silver (Legacy). */
export const LEGACY_FREE_SMART_CARD_BONUS_SILVER_PLUS = 1;

export function checkLegacyTier(successfulReferralCount: number): LegacyTierStored {
  const n = Math.max(0, Math.floor(Number(successfulReferralCount) || 0));
  if (n >= 1000) return 'diamond';
  if (n >= 750) return 'platinum';
  if (n >= 500) return 'gold';
  if (n >= 250) return 'silver';
  return 'none';
}

export function tierRank(tier: LegacyTierStored): number {
  const i = ORDER.indexOf(tier);
  return i >= 0 ? i : 0;
}

export function tierMeetsSilver(tier: LegacyTierStored): boolean {
  return tierRank(tier) >= tierRank('silver');
}

export function tierIsDiamond(tier: LegacyTierStored): boolean {
  return tier === 'diamond';
}

export function parseLegacyTier(raw: unknown): LegacyTierStored {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'silver' || s === 'gold' || s === 'platinum' || s === 'diamond' || s === 'none') {
    return s;
  }
  return 'none';
}

export function partnerBadgeEligibleFromTier(tier: LegacyTierStored): boolean {
  return tierMeetsSilver(tier);
}
