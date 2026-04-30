/**
 * Paridad con `services/tiersConfigService.ts` y `services/businessCardSlotsGate.ts`:
 * límites publicados en Firestore `system_config/tiers` + tier efectivo del doc `users/{uid}`.
 */

export type TierKey = 'free' | 'influencer' | 'business';

export type TierLimits = {
  iconDataLimit: number;
  smartCardsLimit: number;
  businessCardsLimit: number;
  premiumThemes: boolean;
  monthlyPriceUsd: number;
  freeTrialDays: 0 | 14 | 30 | 90;
};

export type AddOnsConfig = {
  singleBusinessCardExtraUsd: number;
  physicalPvcCardUsd: number;
  physicalMetalCardUsd: number;
};

export type TiersConfig = Record<TierKey, TierLimits> & {
  addOns: AddOnsConfig;
};

export const DEFAULT_TIERS_CONFIG: TiersConfig = {
  free: {
    iconDataLimit: 8,
    smartCardsLimit: 5,
    businessCardsLimit: 0,
    premiumThemes: false,
    monthlyPriceUsd: 0,
    freeTrialDays: 0,
  },
  influencer: {
    iconDataLimit: 20,
    smartCardsLimit: 10,
    businessCardsLimit: 1,
    premiumThemes: true,
    monthlyPriceUsd: 19.99,
    freeTrialDays: 14,
  },
  business: {
    iconDataLimit: 50,
    smartCardsLimit: 10,
    businessCardsLimit: 5,
    premiumThemes: true,
    monthlyPriceUsd: 49.99,
    freeTrialDays: 14,
  },
  addOns: {
    singleBusinessCardExtraUsd: 9.99,
    physicalPvcCardUsd: 29.99,
    physicalMetalCardUsd: 99.99,
  },
};

function coerceTrialDays(value: unknown, fallback: TierLimits['freeTrialDays']): TierLimits['freeTrialDays'] {
  const numeric = Number(value);
  if (numeric === 14 || numeric === 30 || numeric === 90) return numeric;
  if (numeric === 0) return 0;
  return fallback;
}

function coerceTierLimits(raw: unknown, fallback: TierLimits): TierLimits {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const o = raw as Record<string, unknown>;
  return {
    iconDataLimit: Math.max(0, Number(o.iconDataLimit ?? fallback.iconDataLimit) || fallback.iconDataLimit),
    smartCardsLimit: Math.max(0, Number(o.smartCardsLimit ?? fallback.smartCardsLimit) || fallback.smartCardsLimit),
    businessCardsLimit: Math.max(
      0,
      Number(o.businessCardsLimit ?? fallback.businessCardsLimit) || fallback.businessCardsLimit,
    ),
    premiumThemes: Boolean(o.premiumThemes ?? fallback.premiumThemes),
    monthlyPriceUsd: Math.max(0, Number(o.monthlyPriceUsd ?? fallback.monthlyPriceUsd) || 0),
    freeTrialDays: coerceTrialDays(o.freeTrialDays, fallback.freeTrialDays),
  };
}

function coerceAddOns(raw: unknown): AddOnsConfig {
  const fallback = DEFAULT_TIERS_CONFIG.addOns;
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const o = raw as Record<string, unknown>;
  return {
    singleBusinessCardExtraUsd: Math.max(
      0,
      Number(o.singleBusinessCardExtraUsd ?? fallback.singleBusinessCardExtraUsd) || 0,
    ),
    physicalPvcCardUsd: Math.max(0, Number(o.physicalPvcCardUsd ?? fallback.physicalPvcCardUsd) || 0),
    physicalMetalCardUsd: Math.max(0, Number(o.physicalMetalCardUsd ?? fallback.physicalMetalCardUsd) || 0),
  };
}

function mergeWithDefaults(
  data: (Partial<Record<TierKey, unknown>> & { addOns?: unknown }) | undefined,
): TiersConfig {
  return {
    free: coerceTierLimits(data?.free, DEFAULT_TIERS_CONFIG.free),
    influencer: coerceTierLimits(data?.influencer, DEFAULT_TIERS_CONFIG.influencer),
    business: coerceTierLimits(data?.business, DEFAULT_TIERS_CONFIG.business),
    addOns: coerceAddOns(data?.addOns),
  };
}

/** Normaliza el snapshot de `system_config/tiers` o devuelve defaults. */
export function mergeTiersConfigFromFirestore(raw: unknown): TiersConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_TIERS_CONFIG };
  }
  return mergeWithDefaults(raw as Partial<Record<TierKey, unknown>> & { addOns?: unknown });
}

function normalizeTierKey(value: unknown): TierKey | null {
  const t = String(value ?? '').trim().toLowerCase();
  if (t === 'free' || t === 'influencer' || t === 'business') return t;
  return null;
}

function subscriptionTierActive(data: Record<string, unknown>): boolean {
  const untilRaw = data.premiumUntil ?? data.subscriptionExpiresAt;
  if (untilRaw != null && untilRaw !== '') {
    const d = untilRaw instanceof Date ? untilRaw : new Date(String(untilRaw));
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) {
      return true;
    }
  }
  const st = String(data.subscriptionStatus ?? '').trim().toLowerCase();
  if (st === 'active' && data.isPremium === true) {
    return true;
  }
  return false;
}

/** Igual que `effectiveTierForSlots` en `businessCardSlotsGate.ts` (sin rama super_admin aquí). */
export function effectiveStudioTierKey(data: Record<string, unknown>): TierKey {
  if (!subscriptionTierActive(data)) {
    return 'free';
  }
  const t = normalizeTierKey(data.tier ?? data.currentTier ?? data.subscriptionTier);
  if (t === 'influencer' || t === 'business') {
    return t;
  }
  return 'free';
}

/** Solo rol en Firestore; Card Studio web no usa refuerzo por email para «ilimitado». */
export function isStudioSuperAdminFirestoreRole(data: Record<string, unknown>): boolean {
  return String(data.role || '').trim().toLowerCase() === 'super_admin';
}
