/**
 * Agrega Stripe (mes UTC) + RevenueCat (overview; puede ser ventana móvil, no mes calendario).
 * Por defecto conservador: si hay varias fuentes habilitadas y alguna falla, no devuelve suma automática.
 */

const { fetchStripeNetUsdCalendarMonthUTC } = require('../services/stripeGateway');
const { fetchRevenueCatOverviewRevenueUsd } = require('../services/revenuecatGateway');

function envTruthy(name) {
  return String(process.env[name] || '').trim() === '1';
}

/**
 * @param {Date} now
 * @returns {Promise<{
 *   autoSumUsd: number|null,
 *   breakdown: object,
 *   usedForRevenue: boolean,
 *   conservativeBlocked: boolean
 * }>}
 */
async function fetchAutoRevenueSnapshot(now = new Date()) {
  const stripeKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const rcKey = String(process.env.REVENUECAT_API_KEY || '').trim();
  const rcProject = String(process.env.REVENUECAT_PROJECT_ID || '').trim();
  const allowPartial = envTruthy('BUDGET_AUTO_ALLOW_PARTIAL_SUM');

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const calendarLabel = `${year}-${String(month).padStart(2, '0')}`;

  const breakdown = {
    calendarMonthUtc: calendarLabel,
    stripeUsd: null,
    revenueCatUsd: null,
    revenueCatMetricId: null,
    revenueCatPeriodNote: null,
    stripeError: null,
    revenueCatError: null,
    autoAttempted: false,
    allowPartialSum: allowPartial,
  };

  const useStripe = Boolean(stripeKey);
  const useRc = Boolean(rcKey && rcProject);

  if (!useStripe && !useRc) {
    return {
      autoSumUsd: null,
      breakdown,
      usedForRevenue: false,
      conservativeBlocked: false,
    };
  }

  breakdown.autoAttempted = true;

  const [st, rc] = await Promise.all([
    useStripe
      ? fetchStripeNetUsdCalendarMonthUTC({ secretKey: stripeKey, year, month })
      : Promise.resolve({ ok: true, skipped: true }),
    useRc
      ? fetchRevenueCatOverviewRevenueUsd({ secretKey: rcKey, projectId: rcProject })
      : Promise.resolve({ ok: true, skipped: true }),
  ]);

  if (useStripe && !st.skipped) {
    if (st.ok) breakdown.stripeUsd = st.usd;
    else breakdown.stripeError = st.error;
  }
  if (useRc && !rc.skipped) {
    if (rc.ok) {
      breakdown.revenueCatUsd = rc.usd;
      breakdown.revenueCatMetricId = rc.metricId;
      breakdown.revenueCatPeriodNote = rc.periodNote;
    } else breakdown.revenueCatError = rc.error;
  }

  const stripeFailed = useStripe && breakdown.stripeError;
  const rcFailed = useRc && breakdown.revenueCatError;

  if (!allowPartial && (stripeFailed || rcFailed)) {
    return {
      autoSumUsd: null,
      breakdown,
      usedForRevenue: false,
      conservativeBlocked: true,
    };
  }

  let sum = 0;
  let any = false;
  if (useStripe && breakdown.stripeUsd != null) {
    sum += breakdown.stripeUsd;
    any = true;
  }
  if (useRc && breakdown.revenueCatUsd != null) {
    sum += breakdown.revenueCatUsd;
    any = true;
  }

  if (!any) {
    return {
      autoSumUsd: null,
      breakdown,
      usedForRevenue: false,
      conservativeBlocked: Boolean(stripeFailed || rcFailed),
    };
  }

  return {
    autoSumUsd: sum,
    breakdown,
    usedForRevenue: true,
    conservativeBlocked: false,
  };
}

module.exports = { fetchAutoRevenueSnapshot };
