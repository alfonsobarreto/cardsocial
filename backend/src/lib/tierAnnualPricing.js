/**
 * Paridad con `services/tierAnnualPricing.ts` (Mercado Pago + tiers).
 */

const DEFAULT_ANNUAL_DISCOUNT_PERCENT = 30;
const MAX_ANNUAL_DISCOUNT_PERCENT = 80;

function clampDiscountPercent(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ANNUAL_DISCOUNT_PERCENT;
  return Math.min(MAX_ANNUAL_DISCOUNT_PERCENT, Math.max(0, Math.round(n)));
}

function computeAnnualUsd(monthlyUsd, discountPercent) {
  const monthly = Math.max(0, Number(monthlyUsd) || 0);
  const discount = clampDiscountPercent(discountPercent);
  const factor = 1 - discount / 100;
  return Math.round(monthly * 12 * factor * 100) / 100;
}

function inferAnnualDiscountPercent(monthlyUsd, storedAnnualUsd, explicitDiscount) {
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

function resolveAnnualPriceUsd(row) {
  if (!row || typeof row !== 'object') return 0;
  const monthly = Math.max(0, Number(row.monthlyPriceUsd) || 0);
  const storedAnnual = Math.max(0, Number(row.annualPriceUsd) || 0);
  const discount = inferAnnualDiscountPercent(monthly, storedAnnual, row.annualDiscountPercent);
  if (monthly > 0) {
    return computeAnnualUsd(monthly, discount);
  }
  return storedAnnual;
}

module.exports = {
  clampDiscountPercent,
  computeAnnualUsd,
  inferAnnualDiscountPercent,
  resolveAnnualPriceUsd,
};
