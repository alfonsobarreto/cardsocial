/**
 * GET  /api/admin/budget-summary
 * PUT  /api/admin/budget-settings
 *
 * Auth: gateway + JWT admin.system + mismo allowlist que system-stats.
 * Revenue: Mongo (manual) tiene prioridad; si no hay manual → suma Stripe+RC si todas las
 * fuentes habilitadas responden (conservador); si no → env BUDGET_MONTHLY_NET_REVENUE_USD.
 */

const { computeTrafficLight, clampPercent, getThresholds } = require('../lib/budgetTrafficLight');
const { fetchAutoRevenueSnapshot } = require('../lib/budgetAutoRevenue');
const { buildUserFacingJson } = require('../lib/userFacingErrors');

const SETTINGS_ID = 'singleton';
const COL_SETTINGS = 'admin_budget_settings';
const COL_AUDIT = 'admin_budget_audit';

function parseAdminSystemStatsUidAllowlist() {
  return new Set(
    String(process.env.ADMIN_SYSTEM_STATS_UIDS || '')
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

async function countMonthlyActiveUsersMongo(db, now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 86400 * 1000);
  try {
    return await db.collection('users').countDocuments({
      $or: [
        { lastCreditActivityAt: { $gte: cutoff } },
        { lastUpdated: { $gte: cutoff } },
        { updatedAt: { $gte: cutoff } },
        { createdAt: { $gte: cutoff } },
      ],
    });
  } catch (e) {
    console.warn('[admin/budget] MAU aggregation fallback:', e?.message || e);
    return 0;
  }
}

async function loadSettings(db) {
  const doc = await db.collection(COL_SETTINGS).findOne({ _id: SETTINGS_ID });
  const pct = clampPercent(doc?.retentionBudgetPercent ?? 8);
  let revenue = null;
  if (doc && doc.reportedMonthlyNetRevenueUsd != null && doc.reportedMonthlyNetRevenueUsd !== '') {
    const n = Number(doc.reportedMonthlyNetRevenueUsd);
    if (Number.isFinite(n) && n >= 0) revenue = n;
  }
  const history = Array.isArray(doc?.channelActivationHistory)
    ? doc.channelActivationHistory
        .filter((row) => row && row.channel && row.at)
        .map((row) => ({
          channel: String(row.channel),
          at: row.at instanceof Date ? row.at.toISOString() : String(row.at),
        }))
    : [];

  return { retentionBudgetPercent: pct, reportedMonthlyNetRevenueUsd: revenue, channelActivationHistory: history };
}

function resolveRevenueUsd(settingsRevenue, autoSnap) {
  if (settingsRevenue != null) {
    return { value: settingsRevenue, source: 'mongo_settings' };
  }
  if (autoSnap?.usedForRevenue && autoSnap.autoSumUsd != null && Number.isFinite(autoSnap.autoSumUsd)) {
    return { value: Math.max(0, autoSnap.autoSumUsd), source: 'payment_providers' };
  }
  const blockEnvFallback =
    Boolean(autoSnap?.conservativeBlocked && autoSnap?.breakdown?.autoAttempted);
  if (!blockEnvFallback) {
    const envVal = String(process.env.BUDGET_MONTHLY_NET_REVENUE_USD || '').trim();
    if (envVal !== '') {
      const n = Number(envVal);
      if (Number.isFinite(n) && n >= 0) return { value: n, source: 'env' };
    }
  }
  return { value: null, source: 'missing' };
}

function createAdminBudgetHandlers({ getMongoDb }) {
  function assertBudgetAccess(req, res) {
    const uid = String(req.auth?.sub || '').trim();
    const allowed = parseAdminSystemStatsUidAllowlist();
    if (!uid || !allowed.has(uid)) {
      res.status(403).json(buildUserFacingJson(req, 'admin_restricted', 'ADMIN_SYSTEM_STATS_UID_NOT_ALLOWED'));
      return false;
    }
    return true;
  }

  async function budgetSummaryHandler(req, res) {
    try {
      if (!assertBudgetAccess(req, res)) return;

      const db = typeof getMongoDb === 'function' ? getMongoDb() : null;
      if (!db) {
        return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
      }

      const now = new Date();
      const settings = await loadSettings(db);
      const autoSnap = await fetchAutoRevenueSnapshot(now);

      if (autoSnap.conservativeBlocked && autoSnap.breakdown.autoAttempted) {
        await db.collection(COL_AUDIT).insertOne({
          at: now,
          actorUid: String(req.auth?.sub || '').trim() || 'unknown',
          action: 'budget_auto_revenue_blocked',
          stripeError: autoSnap.breakdown.stripeError || null,
          revenueCatError: autoSnap.breakdown.revenueCatError || null,
        }).catch(() => null);
      }

      const { value: monthlyNetRevenueUsd, source: revenueSource } = resolveRevenueUsd(
        settings.reportedMonthlyNetRevenueUsd,
        autoSnap,
      );

      const monthlyActiveUsers = await countMonthlyActiveUsersMongo(db, now);

      const light = computeTrafficLight({
        monthlyActiveUsers,
        monthlyNetRevenueUsd,
        retentionBudgetPercent: settings.retentionBudgetPercent,
      });

      const retentionBudgetUsd =
        monthlyNetRevenueUsd != null
          ? (monthlyNetRevenueUsd * settings.retentionBudgetPercent) / 100
          : null;

      const revenueBreakdown =
        autoSnap.breakdown.autoAttempted
          ? {
              calendarMonthUtc: autoSnap.breakdown.calendarMonthUtc,
              stripeUsd: autoSnap.breakdown.stripeUsd,
              revenueCatUsd: autoSnap.breakdown.revenueCatUsd,
              revenueCatMetricId: autoSnap.breakdown.revenueCatMetricId,
              revenueCatPeriodNote: autoSnap.breakdown.revenueCatPeriodNote,
              stripeError: autoSnap.breakdown.stripeError,
              revenueCatError: autoSnap.breakdown.revenueCatError,
              conservativeBlocked: autoSnap.conservativeBlocked,
              allowPartialSum: autoSnap.breakdown.allowPartialSum,
            }
          : null;

      const disclaimers = [
        'MAU = usuarios Mongo con señal en últimos 30 días (lastCreditActivityAt | lastUpdated | updatedAt | createdAt).',
      ];
      if (revenueSource === 'missing') {
        disclaimers.push(
          'Revenue USD no disponible: declara valor en el panel, configura proveedores (STRIPE_SECRET_KEY / REVENUECAT_*), o BUDGET_MONTHLY_NET_REVENUE_USD.',
        );
      } else if (revenueSource === 'payment_providers') {
        disclaimers.push(
          'Revenue USD = suma automática Stripe (neto mes UTC en balance transactions) + RevenueCat overview (métrica puede ser ventana móvil, ver revenueCatPeriodNote). Revisa solape web/app para no duplicar.',
        );
      } else if (revenueSource === 'mongo_settings') {
        disclaimers.push(
          'Revenue USD desde valor declarado en Mongo (prioridad sobre automático y env).',
        );
      } else {
        disclaimers.push(`Revenue USD fuente: ${revenueSource}.`);
      }
      if (autoSnap.conservativeBlocked) {
        disclaimers.push(
          'Proveedores configurados pero falló al menos una fuente y BUDGET_AUTO_ALLOW_PARTIAL_SUM≠1: no usamos suma parcial ni BUDGET_MONTHLY_NET_REVENUE_USD hasta recuperar APIs (semáforo conservador). Declara revenue en Mongo si necesitas un valor auditado manual.',
        );
      }
      disclaimers.push(
        'Este panel no envía Push/SMS ni contrata proveedores; solo orienta la decisión.',
      );

      const payload = {
        ok: true,
        generatedAt: now.toISOString(),
        monthlyActiveUsers,
        monthlyNetRevenueUsd,
        revenueSource,
        revenueBreakdown,
        retentionBudgetPercent: settings.retentionBudgetPercent,
        retentionBudgetUsd,
        trafficLight: {
          status: light.status,
          reasons: light.reasons,
          messageEs: light.messages.es,
          messageEn: light.messages.en,
        },
        channelsUnlocked: light.status === 'green',
        channelActivationHistory: settings.channelActivationHistory,
        thresholds: getThresholds(),
        disclaimers,
      };

      console.log(
        JSON.stringify({
          tag: 'budget_summary',
          at: payload.generatedAt,
          actorUid: String(req.auth?.sub || ''),
          status: light.status,
          mau: monthlyActiveUsers,
          revenueSource,
          autoProvidersAttempted: Boolean(autoSnap.breakdown.autoAttempted),
          conservativeBlocked: Boolean(autoSnap.conservativeBlocked),
        }),
      );

      return res.status(200).json(payload);
    } catch (e) {
      console.error('[admin/budget-summary]', e?.message || e, e?.stack);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  }

  async function budgetSettingsPutHandler(req, res) {
    try {
      if (!assertBudgetAccess(req, res)) return;

      const db = typeof getMongoDb === 'function' ? getMongoDb() : null;
      if (!db) {
        return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
      }

      const body = req.body || {};
      const patch = {};

      if (body.retentionBudgetPercent !== undefined) {
        patch.retentionBudgetPercent = clampPercent(body.retentionBudgetPercent);
      }

      if (body.reportedMonthlyNetRevenueUsd !== undefined) {
        if (body.reportedMonthlyNetRevenueUsd === null || body.reportedMonthlyNetRevenueUsd === '') {
          patch.reportedMonthlyNetRevenueUsd = null;
        } else {
          const n = Number(body.reportedMonthlyNetRevenueUsd);
          if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'ADMIN_BUDGET_REVENUE_INVALID'));
          }
          patch.reportedMonthlyNetRevenueUsd = n;
        }
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'ADMIN_BUDGET_NO_FIELDS'));
      }

      const now = new Date();
      const actorUid = String(req.auth?.sub || '').trim();

      await db.collection(COL_SETTINGS).updateOne(
        { _id: SETTINGS_ID },
        {
          $set: { ...patch, updatedAt: now, updatedByUid: actorUid },
          $setOnInsert: { _id: SETTINGS_ID, channelActivationHistory: [], createdAt: now },
        },
        { upsert: true },
      );

      await db.collection(COL_AUDIT).insertOne({
        at: now,
        actorUid,
        action: 'budget_settings_update',
        patch,
      }).catch(() => null);

      console.log(
        JSON.stringify({
          tag: 'budget_settings_audit',
          at: now.toISOString(),
          actorUid,
          patch,
        }),
      );

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[admin/budget-settings]', e?.message || e, e?.stack);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  }

  return { budgetSummaryHandler, budgetSettingsPutHandler };
}

module.exports = { createAdminBudgetHandlers };
