/**
 * Lectura de pricing / límites publicados en Firestore (`system_config/tiers`).
 * Sin precios inventados: si no hay documento, retorna null. Coerción de campos faltantes usa solo ceros.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { getRadarTrialEnabledSync } from '@/services/radarTrialEnabledCache';

export type TierKey = 'free' | 'influencer' | 'business';

export type TierLimits = {
  iconDataLimit: number;
  smartCardsLimit: number;
  businessCardsLimit: number;
  premiumThemes: boolean;
  monthlyPriceUsd: number;
  /** Equivalente publicado en CS (Regla de los dos casilleros; no derivado de USD en código). */
  monthlyEquivalentCs: number;
  annualPriceUsd: number;
  annualEquivalentCs: number;
  voipMinutesIncluded: number;
  annualWelcomeGiftCs: number;
  freeTrialDays: 0 | 14 | 30 | 90;
};

export type AddOnsConfig = {
  singleBusinessCardExtraUsd: number;
  singleBusinessCardExtraCs: number;
  physicalPvcCardUsd: number;
  physicalPvcCardCs: number;
  physicalMetalCardUsd: number;
  physicalMetalCardCs: number;
  shippingUsDomesticUsd: number;
  shippingUsDomesticCs: number;
  shippingMxCaUsd: number;
  shippingMxCaCs: number;
  shippingInternationalUsd: number;
  shippingInternationalCs: number;
};

export type TiersConfig = Record<TierKey, TierLimits> & {
  addOns: AddOnsConfig;
};

const TIERS_REF = doc(db, 'system_config', 'tiers');

const ZERO_TIER: TierLimits = {
  iconDataLimit: 0,
  smartCardsLimit: 0,
  businessCardsLimit: 0,
  premiumThemes: false,
  monthlyPriceUsd: 0,
  monthlyEquivalentCs: 0,
  annualPriceUsd: 0,
  annualEquivalentCs: 0,
  voipMinutesIncluded: 0,
  annualWelcomeGiftCs: 0,
  freeTrialDays: 0,
};

const ZERO_ADDONS: AddOnsConfig = {
  singleBusinessCardExtraUsd: 0,
  singleBusinessCardExtraCs: 0,
  physicalPvcCardUsd: 0,
  physicalPvcCardCs: 0,
  physicalMetalCardUsd: 0,
  physicalMetalCardCs: 0,
  shippingUsDomesticUsd: 0,
  shippingUsDomesticCs: 0,
  shippingMxCaUsd: 0,
  shippingMxCaCs: 0,
  shippingInternationalUsd: 0,
  shippingInternationalCs: 0,
};

/** Estructura vacía (ceros) para formularios / estado inicial; no sustituye al CMS en runtime. */
export const DEFAULT_TIERS_CONFIG: TiersConfig = {
  free: { ...ZERO_TIER },
  influencer: { ...ZERO_TIER },
  business: { ...ZERO_TIER },
  addOns: { ...ZERO_ADDONS },
};

function coerceTrialDays(value: unknown, fallback: TierLimits['freeTrialDays']): TierLimits['freeTrialDays'] {
  const numeric = Number(value);
  if (numeric === 14 || numeric === 30 || numeric === 90) return numeric;
  if (numeric === 0) return 0;
  return fallback;
}

function coerceTierLimits(raw: unknown, structuralFallback: TierLimits): TierLimits {
  if (!raw || typeof raw !== 'object') return { ...structuralFallback };
  const o = raw as Record<string, unknown>;
  const monthlyPriceUsd = Math.max(0, Number(o.monthlyPriceUsd ?? structuralFallback.monthlyPriceUsd) || 0);
  const monthlyEqRaw = o.monthlyEquivalentCs;
  const monthlyEquivalentCs =
    monthlyEqRaw !== undefined && monthlyEqRaw !== null && String(monthlyEqRaw).trim() !== ''
      ? Math.max(0, Math.floor(Number(monthlyEqRaw) || 0))
      : Math.max(0, Math.floor(structuralFallback.monthlyEquivalentCs));
  const annualRaw = o.annualPriceUsd;
  const annualPriceUsd =
    annualRaw !== undefined && annualRaw !== null && String(annualRaw).trim() !== ''
      ? Math.max(0, Number(annualRaw) || 0)
      : 0;
  const annualEqRaw = o.annualEquivalentCs;
  const annualEquivalentCs =
    annualEqRaw !== undefined && annualEqRaw !== null && String(annualEqRaw).trim() !== ''
      ? Math.max(0, Math.floor(Number(annualEqRaw) || 0))
      : Math.max(0, Math.floor(structuralFallback.annualEquivalentCs));
  const voipRaw = o.voipMinutesIncluded;
  const voipMinutesIncluded =
    voipRaw !== undefined && voipRaw !== null && String(voipRaw).trim() !== ''
      ? Math.max(0, Math.floor(Number(voipRaw) || 0))
      : Math.max(0, Math.floor(structuralFallback.voipMinutesIncluded));
  const giftRaw = o.annualWelcomeGiftCs;
  const annualWelcomeGiftCs =
    giftRaw !== undefined && giftRaw !== null && String(giftRaw).trim() !== ''
      ? Math.max(0, Math.floor(Number(giftRaw) || 0))
      : Math.max(0, Math.floor(structuralFallback.annualWelcomeGiftCs));
  return {
    iconDataLimit: Math.max(0, Number(o.iconDataLimit ?? structuralFallback.iconDataLimit) || 0),
    smartCardsLimit: Math.max(0, Number(o.smartCardsLimit ?? structuralFallback.smartCardsLimit) || 0),
    businessCardsLimit: Math.max(
      0,
      Number(o.businessCardsLimit ?? structuralFallback.businessCardsLimit) || 0,
    ),
    premiumThemes: Boolean(o.premiumThemes ?? structuralFallback.premiumThemes),
    monthlyPriceUsd,
    monthlyEquivalentCs,
    annualPriceUsd,
    annualEquivalentCs,
    voipMinutesIncluded,
    annualWelcomeGiftCs,
    freeTrialDays: coerceTrialDays(o.freeTrialDays, structuralFallback.freeTrialDays),
  };
}

function coerceAddOns(raw: unknown): AddOnsConfig {
  if (!raw || typeof raw !== 'object') return { ...ZERO_ADDONS };
  const o = raw as Record<string, unknown>;
  return {
    singleBusinessCardExtraUsd: Math.max(
      0,
      Number(o.singleBusinessCardExtraUsd ?? ZERO_ADDONS.singleBusinessCardExtraUsd) || 0,
    ),
    singleBusinessCardExtraCs: Math.max(
      0,
      Math.floor(Number(o.singleBusinessCardExtraCs ?? ZERO_ADDONS.singleBusinessCardExtraCs) || 0),
    ),
    physicalPvcCardUsd: Math.max(0, Number(o.physicalPvcCardUsd ?? ZERO_ADDONS.physicalPvcCardUsd) || 0),
    physicalPvcCardCs: Math.max(0, Math.floor(Number(o.physicalPvcCardCs ?? ZERO_ADDONS.physicalPvcCardCs) || 0)),
    physicalMetalCardUsd: Math.max(0, Number(o.physicalMetalCardUsd ?? ZERO_ADDONS.physicalMetalCardUsd) || 0),
    physicalMetalCardCs: Math.max(0, Math.floor(Number(o.physicalMetalCardCs ?? ZERO_ADDONS.physicalMetalCardCs) || 0)),
    shippingUsDomesticUsd: Math.max(
      0,
      Number(o.shippingUsDomesticUsd ?? ZERO_ADDONS.shippingUsDomesticUsd) || 0,
    ),
    shippingUsDomesticCs: Math.max(
      0,
      Math.floor(Number(o.shippingUsDomesticCs ?? ZERO_ADDONS.shippingUsDomesticCs) || 0),
    ),
    shippingMxCaUsd: Math.max(0, Number(o.shippingMxCaUsd ?? ZERO_ADDONS.shippingMxCaUsd) || 0),
    shippingMxCaCs: Math.max(0, Math.floor(Number(o.shippingMxCaCs ?? ZERO_ADDONS.shippingMxCaCs) || 0)),
    shippingInternationalUsd: Math.max(
      0,
      Number(o.shippingInternationalUsd ?? ZERO_ADDONS.shippingInternationalUsd) || 0,
    ),
    shippingInternationalCs: Math.max(
      0,
      Math.floor(Number(o.shippingInternationalCs ?? ZERO_ADDONS.shippingInternationalCs) || 0),
    ),
  };
}

function mergeWithDefaults(
  data: (Partial<Record<TierKey, unknown>> & { addOns?: unknown }) | undefined,
): TiersConfig {
  return {
    free: coerceTierLimits(data?.free, ZERO_TIER),
    influencer: coerceTierLimits(data?.influencer, ZERO_TIER),
    business: coerceTierLimits(data?.business, ZERO_TIER),
    addOns: coerceAddOns(data?.addOns),
  };
}

/** `null` si el documento no existe o falla la lectura (no hay datos de CMS). */
export async function getTiersConfig(): Promise<TiersConfig | null> {
  try {
    const snap = await getDoc(TIERS_REF);
    if (!snap.exists()) {
      return null;
    }
    return mergeWithDefaults(snap.data() as Partial<Record<TierKey, unknown>> & { addOns?: unknown });
  } catch {
    return null;
  }
}

function normalizeTierKey(value: unknown): TierKey | null {
  const t = String(value ?? '').trim().toLowerCase();
  if (t === 'free') return 'free';
  if (t === 'influencer') return 'influencer';
  if (
    t === 'business' ||
    t === 'corporate' ||
    t === 'pro' ||
    t === 'premium' ||
    t === 'card_social_pro' ||
    t === 'cardsocialpro' ||
    t === 'negocio'
  ) {
    return 'business';
  }
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
  if (st === 'active' || st === 'active-premium') return true;
  if (data.isPremium === true) return true;
  return false;
}

export function readClosedAlphaTierOverride(): TierKey | null {
  try {
    const raw = String(process.env.EXPO_PUBLIC_CLOSED_ALPHA_FULL_TIER ?? '').trim().toLowerCase();
    if (!raw || raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') {
      return null;
    }
    if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'business') {
      return 'business';
    }
    if (raw === 'influencer') {
      return 'influencer';
    }
  } catch {
    /* no env en runtime raro */
  }
  return null;
}

export function effectiveTierKeyFromUserData(data: Record<string, unknown>): TierKey {
  const alphaTier = readClosedAlphaTierOverride();
  if (alphaTier) {
    return alphaTier;
  }
  if (getRadarTrialEnabledSync()) {
    return 'business';
  }
  if (!subscriptionTierActive(data)) {
    return 'free';
  }
  const t = normalizeTierKey(data.tier ?? data.currentTier ?? data.subscriptionTier);
  if (t === 'influencer' || t === 'business') {
    return t;
  }
  if (t === 'free') {
    return 'free';
  }
  return 'business';
}
