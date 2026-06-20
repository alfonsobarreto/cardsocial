/**
 * Smoke: precio anual derivado + migración docs viejos (sin annualDiscountPercent).
 */
import assert from 'node:assert/strict';
import {
  computeAnnualUsd,
  computeAnnualCs,
  inferAnnualDiscountPercent,
  coerceAnnualTrialDays,
  resolveTierAnnualPricing,
  DEFAULT_ANNUAL_DISCOUNT_PERCENT,
} from '../services/tierAnnualPricing.ts';

// $10/mes × 12 × 70% = $84/año
assert.equal(computeAnnualUsd(10, 30), 84);

// CS anual con floor
assert.equal(computeAnnualCs(100, 30), Math.floor(100 * 12 * 0.7));

// Default 30% cuando no hay datos
assert.equal(inferAnnualDiscountPercent(10, 0), DEFAULT_ANNUAL_DISCOUNT_PERCENT);

// Inferir desde doc viejo: $90 anual sobre $10/mes → 25%
assert.equal(inferAnnualDiscountPercent(10, 90), 25);

// annualTrialDays: legacy freeTrialDays=15
assert.equal(coerceAnnualTrialDays(undefined, 15), 15);
assert.equal(coerceAnnualTrialDays(0, 15), 0);

// Doc viejo sin annualDiscountPercent pero con annualPriceUsd
const legacy = resolveTierAnnualPricing({
  monthlyPriceUsd: 10,
  monthlyEquivalentCs: 500,
  annualPriceUsd: 84,
});
assert.equal(legacy.annualDiscountPercent, 30);
assert.equal(legacy.annualPriceUsd, 84);
assert.equal(legacy.annualTrialDays, 15);

// Free tier
const free = resolveTierAnnualPricing({
  monthlyPriceUsd: 0,
  monthlyEquivalentCs: 0,
});
assert.equal(free.annualDiscountPercent, 0);
assert.equal(free.annualTrialDays, 0);

console.log('smoke-tier-annual-pricing: ok');
