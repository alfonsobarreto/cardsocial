/**
 * Semáforo financiero para decidir cuándo tiene sentido invertir en retención (Push/SMS).
 * Umbrales por defecto alineados al brief; sobreescribibles por env sin código.
 *
 * Revenue puede venir de datos declarados (Mongo), variables de entorno, o —si están
 * configuradas solo en el servidor— agregación Stripe + RevenueCat (ver adminBudgetRoutes).
 */

function numEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function getThresholds() {
  return {
    /** MAU estrictamente por debajo → contribuye a ROJO */
    redUsersBelow: Math.max(1, Math.floor(numEnv('BUDGET_LIGHT_RED_USERS_BELOW', 500))),
    /** Revenue USD estrictamente por debajo → contribuye a ROJO */
    redRevenueBelow: Math.max(0, numEnv('BUDGET_LIGHT_RED_REVENUE_BELOW', 200)),
    /** Ambos inclusive → VERDE */
    greenUsersMin: Math.max(1, Math.floor(numEnv('BUDGET_LIGHT_GREEN_MIN_USERS', 1000))),
    greenRevenueMin: Math.max(0, numEnv('BUDGET_LIGHT_GREEN_MIN_REVENUE_USD', 1000)),
  };
}

/**
 * @param {object} input
 * @param {number} input.monthlyActiveUsers
 * @param {number|null} input.monthlyNetRevenueUsd — null = no configurado (modo conservador)
 * @param {number} input.retentionBudgetPercent 0–100
 */
function computeTrafficLight(input) {
  const mau = Math.max(0, Math.floor(Number(input.monthlyActiveUsers) || 0));
  const revRaw = input.monthlyNetRevenueUsd;
  const revenueConfigured = revRaw != null && Number.isFinite(Number(revRaw));
  const rev = revenueConfigured ? Math.max(0, Number(revRaw)) : 0;
  const t = getThresholds();

  const reasons = [];
  let status = 'yellow';

  if (!revenueConfigured) {
    reasons.push('revenue_not_configured');
    status = 'red';
    return {
      status,
      reasons,
      messages: {
        es:
          'Ingreso mensual neto (USD) no está configurado. El semáforo permanece en ROJO hasta que registres un valor auditables (no activamos canales de pago).',
        en:
          'Monthly net revenue (USD) is not set. Traffic light stays RED until you record an auditable figure (paid channels stay off).',
      },
      thresholdsApplied: t,
    };
  }

  if (mau < t.redUsersBelow || rev < t.redRevenueBelow) {
    status = 'red';
    if (mau < t.redUsersBelow) reasons.push('mau_below_red');
    if (rev < t.redRevenueBelow) reasons.push('revenue_below_red');
    return {
      status,
      reasons,
      messages: {
        es:
          'Semáforo ROJO: volumen o ingreso aún no justifica invertir en Push/SMS. Enfócate en crecimiento orgánico y unit economics antes de gastar en retención.',
        en:
          'RED light: scale or revenue does not yet justify Push/SMS spend. Prioritize organic growth before retention paid channels.',
      },
      thresholdsApplied: t,
    };
  }

  if (mau >= t.greenUsersMin && rev >= t.greenRevenueMin) {
    status = 'green';
    reasons.push('mau_and_revenue_green');
    return {
      status,
      reasons,
      messages: {
        es:
          'Semáforo VERDE: métricas mínimas alcanzadas. Puedes planificar Push/SMS con techo = % de budget de retención (aún sin conectar proveedores reales).',
        en:
          'GREEN light: minimum metrics met. You may plan Push/SMS capped by retention budget % (providers still not wired).',
      },
      thresholdsApplied: t,
    };
  }

  status = 'yellow';
  reasons.push('between_red_and_green');
  return {
    status,
    reasons,
    messages: {
      es:
        'Semáforo AMARILLO: vas en buen camino. Revisa margen y cohortes antes de activar gasto recurrente en retención.',
      en:
        'YELLOW light: trending well. Review margin and cohorts before turning on recurring retention spend.',
    },
    thresholdsApplied: t,
  };
}

function clampPercent(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 8;
  return Math.min(100, Math.max(0, n));
}

module.exports = {
  computeTrafficLight,
  clampPercent,
  getThresholds,
};
