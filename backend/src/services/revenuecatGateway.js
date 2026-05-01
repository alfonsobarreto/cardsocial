/**
 * RevenueCat REST v2 — métricas overview (solo lectura).
 * La API puede exigir permiso charts_metrics:overview:read en la secret key del proyecto.
 */

const RC_BASE = 'https://api.revenuecat.com/v2';

/**
 * Busca un valor USD “tipo revenue” en overview; prioriza ventanas explícitas sobre MRR.
 *
 * @param {object} opts
 * @param {string} opts.secretKey — Secret API key (Bearer)
 * @param {string} opts.projectId — project_id de RevenueCat
 * @returns {Promise<{ ok: true, usd: number, metricId: string, periodNote: string } | { ok: false, error: string }>}
 */
async function fetchRevenueCatOverviewRevenueUsd({ secretKey, projectId }) {
  if (!secretKey || !projectId) {
    return { ok: false, error: 'revenuecat_missing_params' };
  }

  const url = `${RC_BASE}/projects/${encodeURIComponent(projectId)}/metrics/overview?currency=USD`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
      },
    });

    const rawText = await res.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }

    if (!res.ok) {
      console.error(
        JSON.stringify({
          tag: 'revenuecat_gateway_error',
          status: res.status,
          message: typeof data?.message === 'string' ? data.message : rawText.slice(0, 120),
        }),
      );
      return { ok: false, error: `revenuecat_http_${res.status}` };
    }

    const metrics = Array.isArray(data.metrics) ? data.metrics : [];
    const priorityIds = [
      'revenue_last_28_days',
      'total_revenue',
      'revenue',
      'estimated_revenue',
      'mrr',
    ];

    let picked = null;
    for (const id of priorityIds) {
      const m = metrics.find((x) => x && x.id === id);
      const v = m != null ? Number(m.value) : NaN;
      if (Number.isFinite(v)) {
        picked = { id, valueUsd: v };
        break;
      }
    }

    if (!picked) {
      const fuzzy = metrics.find(
        (x) =>
          x &&
          String(x.id || '')
            .toLowerCase()
            .includes('revenue'),
      );
      const v = fuzzy != null ? Number(fuzzy.value) : NaN;
      if (Number.isFinite(v)) picked = { id: String(fuzzy.id), valueUsd: v };
    }

    if (!picked) {
      return { ok: false, error: 'revenuecat_no_revenue_metric' };
    }

    const periodNote =
      String(picked.id).includes('28') || String(picked.id).toLowerCase().includes('last')
        ? 'metric_is_trailing_window_not_calendar_month'
        : 'overview_metric';

    return {
      ok: true,
      usd: picked.valueUsd,
      metricId: picked.id,
      periodNote,
    };
  } catch (e) {
    const msg = e?.message || String(e);
    console.error(JSON.stringify({ tag: 'revenuecat_gateway_error', message: msg }));
    return { ok: false, error: 'revenuecat_request_failed' };
  }
}

module.exports = { fetchRevenueCatOverviewRevenueUsd };
