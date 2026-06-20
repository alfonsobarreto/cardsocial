/**
 * Paridad con `services/tiersConfigService.ts` y `services/businessCardSlotsGate.ts`:
 * límites publicados en Firestore `system_config/tiers` + tier efectivo del doc `users/{uid}`.
 */
import { resolveTierAnnualPricing } from './tierAnnualPricing';

export type TierKey = 'free' | 'influencer' | 'business';

export type TierLimits = {
  iconDataLimit: number;
  smartCardsLimit: number;
  businessCardsLimit: number;
  premiumThemes: boolean;
  monthlyPriceUsd: number;
  monthlyEquivalentCs: number;
  /** % de descuento sobre 12× mensual (plan anual). */
  annualDiscountPercent: number;
  /** Prueba gratis solo en checkout anual. */
  annualTrialDays: 0 | 15;
  annualPriceUsd: number;
  annualEquivalentCs: number;
  voipMinutesIncluded: number;
  annualWelcomeGiftCs: number;
  /** Legacy: espejo de `annualTrialDays` al guardar. */
  freeTrialDays: 0 | 14 | 15 | 30 | 90;
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

const ZERO_TIER: TierLimits = {
  iconDataLimit: 0,
  smartCardsLimit: 0,
  businessCardsLimit: 0,
  premiumThemes: false,
  monthlyPriceUsd: 0,
  monthlyEquivalentCs: 0,
  annualDiscountPercent: 0,
  annualTrialDays: 0,
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

export const DEFAULT_TIERS_CONFIG: TiersConfig = {
  free: { ...ZERO_TIER },
  influencer: { ...ZERO_TIER },
  business: { ...ZERO_TIER },
  addOns: { ...ZERO_ADDONS },
};

function coerceTrialDays(value: unknown, fallback: TierLimits['freeTrialDays']): TierLimits['freeTrialDays'] {
  const numeric = Number(value);
  if (numeric === 15) return 15;
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
  const storedAnnualUsd =
    annualRaw !== undefined && annualRaw !== null && String(annualRaw).trim() !== ''
      ? Math.max(0, Number(annualRaw) || 0)
      : 0;
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

  const derived = resolveTierAnnualPricing({
    monthlyPriceUsd,
    monthlyEquivalentCs,
    annualDiscountPercent:
      o.annualDiscountPercent !== undefined && o.annualDiscountPercent !== null
        ? Number(o.annualDiscountPercent)
        : undefined,
    annualTrialDays:
      o.annualTrialDays !== undefined && o.annualTrialDays !== null
        ? Number(o.annualTrialDays)
        : undefined,
    annualPriceUsd: storedAnnualUsd,
    freeTrialDays:
      o.freeTrialDays !== undefined && o.freeTrialDays !== null ? Number(o.freeTrialDays) : undefined,
  });

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
    annualDiscountPercent: derived.annualDiscountPercent,
    annualTrialDays: derived.annualTrialDays,
    annualPriceUsd: derived.annualPriceUsd,
    annualEquivalentCs: derived.annualEquivalentCs,
    voipMinutesIncluded,
    annualWelcomeGiftCs,
    freeTrialDays: coerceTrialDays(derived.freeTrialDays, structuralFallback.freeTrialDays),
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

/** Normaliza el snapshot de `system_config/tiers` o devuelve defaults. */
export function mergeTiersConfigFromFirestore(raw: unknown): TiersConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_TIERS_CONFIG };
  }
  return mergeWithDefaults(raw as Partial<Record<TierKey, unknown>> & { addOns?: unknown });
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

/** Igual que `effectiveTierForSlots` en `businessCardSlotsGate.ts` (sin rama super_admin aquí). */
export function effectiveStudioTierKey(data: Record<string, unknown>): TierKey {
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

/** Solo rol en Firestore; Card Studio web no usa refuerzo por email para «ilimitado». */
export function isStudioSuperAdminFirestoreRole(data: Record<string, unknown>): boolean {
  return String(data.role || '').trim().toLowerCase() === 'super_admin';
}
