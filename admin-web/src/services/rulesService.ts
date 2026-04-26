import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export type TierKey = 'free' | 'influencer' | 'business';

export type TierLimits = {
  iconDataLimit: number;
  smartCardsLimit: number;
  businessCardsLimit: number;
  premiumThemes: boolean;
};

export type TiersConfig = Record<TierKey, TierLimits>;

const TIERS_DOC = doc(db, 'system_config', 'tiers');

export const DEFAULT_TIERS_CONFIG: TiersConfig = {
  free: {
    iconDataLimit: 8,
    smartCardsLimit: 5,
    businessCardsLimit: 0,
    premiumThemes: false,
  },
  influencer: {
    iconDataLimit: 20,
    smartCardsLimit: 10,
    businessCardsLimit: 1,
    premiumThemes: true,
  },
  business: {
    iconDataLimit: 50,
    smartCardsLimit: 10,
    businessCardsLimit: 5,
    premiumThemes: true,
  },
};

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
  };
}

function mergeWithDefaults(data: Partial<Record<TierKey, unknown>> | undefined): TiersConfig {
  return {
    free: coerceTierLimits(data?.free, DEFAULT_TIERS_CONFIG.free),
    influencer: coerceTierLimits(data?.influencer, DEFAULT_TIERS_CONFIG.influencer),
    business: coerceTierLimits(data?.business, DEFAULT_TIERS_CONFIG.business),
  };
}

export async function getTiersConfig(): Promise<TiersConfig> {
  const snap = await getDoc(TIERS_DOC);

  if (!snap.exists()) {
    return { ...DEFAULT_TIERS_CONFIG };
  }

  return mergeWithDefaults(snap.data() as Partial<Record<TierKey, unknown>>);
}

export async function updateTiersConfig(config: TiersConfig): Promise<void> {
  const payload = {
    free: config.free,
    influencer: config.influencer,
    business: config.business,
    updatedAt: serverTimestamp(),
  };

  await setDoc(TIERS_DOC, payload, { merge: true });
}
