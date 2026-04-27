/**
 * Lectura de pricing / límites publicados en Firestore (`system_config/tiers`).
 * Misma forma que admin-web `rulesService.ts` para paridad CMS ↔ app.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

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

const TIERS_REF = doc(db, 'system_config', 'tiers');

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

export async function getTiersConfig(): Promise<TiersConfig> {
  try {
    const snap = await getDoc(TIERS_REF);
    if (!snap.exists()) {
      return { ...DEFAULT_TIERS_CONFIG };
    }
    return mergeWithDefaults(snap.data() as Partial<Record<TierKey, unknown>> & { addOns?: unknown });
  } catch {
    return { ...DEFAULT_TIERS_CONFIG };
  }
}
