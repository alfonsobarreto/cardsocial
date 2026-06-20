/**
 * Smoke tests for subscription price visibility rules.
 * Run: node scripts/smoke-subscription-price-visibility.mjs
 */
import {
  normalizePricePair,
  shouldShowUsdPrice,
  shouldShowCsPaymentPrice,
  shouldShowPriceOption,
  shouldShowCreditPackRow,
} from '../services/subscriptionPriceVisibility.ts';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const zero = normalizePricePair(0, 0);
assert(!shouldShowUsdPrice(zero), 'usd 0 hidden');
assert(!shouldShowCsPaymentPrice(zero, 5000), 'cs 0 hidden even with balance');
assert(!shouldShowPriceOption(zero, 5000), 'row hidden when both 0');

const usdOnly = normalizePricePair(9.99, 0);
assert(shouldShowUsdPrice(usdOnly), 'usd shown');
assert(!shouldShowCsPaymentPrice(usdOnly, 5000), 'cs hidden when config 0');
assert(shouldShowPriceOption(usdOnly, 0), 'row shown with usd only');

const csOnly = normalizePricePair(0, 1200);
assert(!shouldShowUsdPrice(csOnly), 'usd hidden');
assert(!shouldShowCsPaymentPrice(csOnly, 0), 'cs hidden without balance');
assert(shouldShowCsPaymentPrice(csOnly, 100), 'cs shown with balance');
assert(shouldShowPriceOption(csOnly, 100), 'row shown cs only with balance');
assert(!shouldShowPriceOption(csOnly, 0), 'row hidden cs only without balance');

assert(shouldShowCreditPackRow(4.99, 500), 'credit pack row when usd > 0');
assert(!shouldShowCreditPackRow(0, 500), 'credit pack hidden when usd 0');

console.log('subscriptionPriceVisibility: ok');
