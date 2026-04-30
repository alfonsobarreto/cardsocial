/**
 * GET /api/admin/system-stats
 * Requiere: x-api-gateway-key, Authorization Bearer (JWT scope admin.system).
 * Autorización: `req.auth.sub` (uid del JWT emitido por POST /api/auth/token) debe estar en
 * `ADMIN_SYSTEM_STATS_UIDS` del entorno del backend (process.env, sin prefijo VITE).
 */

function parseAdminSystemStatsUidAllowlist() {
  return new Set(
    String(process.env.ADMIN_SYSTEM_STATS_UIDS || '')
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function toSubscriptionLabel(id) {
  if (id === null || id === undefined) return '(sin plan)';
  return String(id);
}

function createAdminSystemStatsHandler({ getMongoDb }) {
  return async function adminSystemStatsHandler(req, res) {
      try {
        const db = typeof getMongoDb === 'function' ? getMongoDb() : null;
        if (!db) {
          return res.status(500).json({ ok: false, error: 'Database not available' });
        }

        const now = new Date();
        const in7 = new Date(now.getTime() + 7 * 86400 * 1000);

        const business_cards_total = await db.collection('business_cards').countDocuments();

        const lic = db.collection('business_card_licenses');
        const licenses_active = await lic.countDocuments({
          isActive: true,
          expiresAt: { $gt: now },
        });
        const licenses_expiring_next_7d = await lic.countDocuments({
          isActive: true,
          expiresAt: { $gt: now, $lte: in7 },
        });

        let mongo_users_by_subscription_plan = [];
        try {
          const rows = await db
            .collection('users')
            .aggregate([
              { $group: { _id: '$subscriptionPlan', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ])
            .toArray();
          mongo_users_by_subscription_plan = rows.map((r) => ({
            subscriptionPlan: toSubscriptionLabel(r._id),
            count: Number(r.count || 0),
          }));
        } catch (e) {
          console.warn('[admin/system-stats] subscription aggregation skipped:', e?.message || e);
          mongo_users_by_subscription_plan = [];
        }

        const uid = String(req.auth?.sub || '').trim();
        const allowedUids = parseAdminSystemStatsUidAllowlist();

        if (!uid || !allowedUids.has(uid)) {
          return res.status(403).json({
            ok: false,
            error: 'Unauthorized: JWT sub not listed in ADMIN_SYSTEM_STATS_UIDS',
          });
        }

        return res.status(200).json({
          ok: true,
          generatedAt: now.toISOString(),
          business_cards_total,
          licenses: {
            active: licenses_active,
            expiring_next_7d: licenses_expiring_next_7d,
          },
          mongo_users_by_subscription_plan,
        });
      } catch (e) {
        console.error('[admin/system-stats]', e);
        return res.status(500).json({ ok: false, error: e.message || 'system-stats failed' });
      }
    };
}

module.exports = { createAdminSystemStatsHandler };
