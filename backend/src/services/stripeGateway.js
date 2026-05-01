/**
 * Solo reporting: balance transactions netas por mes calendario UTC.
 * No webhooks ni cobros. Nunca loguear el secret.
 */

const SKIP_BALANCE_TYPES = new Set(['payout', 'reserved_funds']);

/**
 * @param {object} opts
 * @param {string} opts.secretKey
 * @param {number} opts.year — UTC
 * @param {number} opts.month — 1–12 UTC
 * @returns {Promise<{ ok: true, usd: number } | { ok: false, error: string }>}
 */
async function fetchStripeNetUsdCalendarMonthUTC({ secretKey, year, month }) {
  if (!secretKey || !Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { ok: false, error: 'stripe_missing_params' };
  }
  try {
    // eslint-disable-next-line global-require
    const Stripe = require('stripe');
    const stripe = new Stripe(secretKey);
    const gte = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
    const lt = Math.floor(Date.UTC(year, month, 1) / 1000);

    let netCents = 0;
    for await (const bt of stripe.balanceTransactions.list({
      created: { gte, lt },
      limit: 100,
    })) {
      if (SKIP_BALANCE_TYPES.has(bt.type)) continue;
      netCents += bt.net;
    }

    return { ok: true, usd: netCents / 100 };
  } catch (e) {
    const status = e?.statusCode || e?.raw?.statusCode;
    const msg = e?.message || String(e);
    console.error(
      JSON.stringify({
        tag: 'stripe_gateway_error',
        status: status || null,
        message: msg,
      }),
    );
    return { ok: false, error: status ? `stripe_http_${status}` : 'stripe_request_failed' };
  }
}

module.exports = { fetchStripeNetUsdCalendarMonthUTC };
