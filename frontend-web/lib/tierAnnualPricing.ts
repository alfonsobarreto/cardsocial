/**
 * Paridad con `services/tierAnnualPricing.ts` (landing / suscripciones).
 */

export const DEFAULT_ANNUAL_DISCOUNT_PERCENT = 30;
export const DEFAULT_ANNUAL_TRIAL_DAYS = 15;
export const MAX_ANNUAL_DISCOUNT_PERCENT = 80;

export type TierAnnualPricingInput = {
  monthlyPriceUsd: number;
  monthlyEquivalentCs: number;
  annualDiscountPercent?: number;
  annualTrialDays?: number;
  annualPriceUsd?: number;
  freeTrialDays?: number;
};

export type TierAnnualPricingDerived = {
  annualDiscountPercent: number;
  annualTrialDays: 0 | 15;
  annualPriceUsd: number;
  annualEquivalentCs: number;
  freeTrialDays: 0 | 15;
};

export function clampDiscountPercent(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ANNUAL_DISCOUNT_PERCENT;
  return Math.min(MAX_ANNUAL_DISCOUNT_PERCENT, Math.max(0, Math.round(n)));
}

export function computeAnnualUsd(monthlyUsd: number, discountPercent: number): number {
  const monthly = Math.max(0, Number(monthlyUsd) || 0);
  const discount = clampDiscountPercent(discountPercent);
  const factor = 1 - discount / 100;
  return Math.round(monthly * 12 * factor * 100) / 100;
}

export function computeAnnualCs(monthlyCs: number, discountPercent: number): number {
  const monthly = Math.max(0, Math.floor(Number(monthlyCs) || 0));
  const discount = clampDiscountPercent(discountPercent);
  const factor = 1 - discount / 100;
  return Math.max(0, Math.floor(monthly * 12 * factor));
}

export function inferAnnualDiscountPercent(
  monthlyUsd: number,
  storedAnnualUsd: number,
  explicitDiscount?: unknown,
): number {
  if (explicitDiscount !== undefined && explicitDiscount !== null && String(explicitDiscount).trim() !== '') {
    return clampDiscountPercent(explicitDiscount);
  }
  const monthly = Math.max(0, Number(monthlyUsd) || 0);
  const annual = Math.max(0, Number(storedAnnualUsd) || 0);
  if (monthly > 0 && annual > 0) {
    const fullYear = monthly * 12;
    if (fullYear > 0) {
      const implied = (1 - annual / fullYear) * 100;
      return clampDiscountPercent(implied);
    }
  }
  return DEFAULT_ANNUAL_DISCOUNT_PERCENT;
}

export function coerceAnnualTrialDays(raw: unknown, legacyFreeTrialDays?: unknown): 0 | 15 {
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const n = Math.floor(Number(raw) || 0);
    return n === 15 ? 15 : 0;
  }
  const legacy = Math.floor(Number(legacyFreeTrialDays) || 0);
  if (legacy === 15) return 15;
  return DEFAULT_ANNUAL_TRIAL_DAYS;
}

export function effectiveMonthlyFromAnnualUsd(annualUsd: number): number {
  const annual = Math.max(0, Number(annualUsd) || 0);
  if (annual <= 0) return 0;
  return Math.round((annual / 12) * 100) / 100;
}

export function resolveTierAnnualPricing(input: TierAnnualPricingInput): TierAnnualPricingDerived {
  const monthlyPriceUsd = Math.max(0, Number(input.monthlyPriceUsd) || 0);
  const monthlyEquivalentCs = Math.max(0, Math.floor(Number(input.monthlyEquivalentCs) || 0));
  const storedAnnual = Math.max(0, Number(input.annualPriceUsd) || 0);

  if (monthlyPriceUsd <= 0 && monthlyEquivalentCs <= 0) {
    return {
      annualDiscountPercent: 0,
      annualTrialDays: 0,
      annualPriceUsd: 0,
      annualEquivalentCs: 0,
      freeTrialDays: 0,
    };
  }

  const annualDiscountPercent = inferAnnualDiscountPercent(
    monthlyPriceUsd,
    storedAnnual,
    input.annualDiscountPercent,
  );
  const annualTrialDays = coerceAnnualTrialDays(input.annualTrialDays, input.freeTrialDays);
  const annualPriceUsd = computeAnnualUsd(monthlyPriceUsd, annualDiscountPercent);
  const annualEquivalentCs = computeAnnualCs(monthlyEquivalentCs, annualDiscountPercent);

  return {
    annualDiscountPercent,
    annualTrialDays,
    annualPriceUsd,
    annualEquivalentCs,
    freeTrialDays: annualTrialDays,
  };
}
