import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Navigate } from 'react-router-dom';
import { isSuperAdminUser } from '../auth/adminAuthGuard';
import { useAuth } from '../auth/useAuth';
import {
  getStatisticsGrowth,
  type PieSlice,
  type StatisticsGrowthResult,
} from '../services/statsService';
import { type SystemStatsResponse, fetchSystemStats } from '../services/systemStatsService';
import { useAdminT } from '../i18n/useAdminT';

type SystemStatsFetchResult =
  | { ok: true; m: SystemStatsResponse }
  | { ok: false };

function formatInt(n: number): string {
  return n.toLocaleString('es-ES');
}

const PIE_COLORS = [
  '#d97706',
  '#0f172a',
  '#059669',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#65a30d',
  '#ea580c',
  '#4f46e5',
];

function KpiCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  accent?: 'amber' | 'slate' | 'emerald' | 'violet';
}) {
  const ring =
    accent === 'amber'
      ? 'ring-amber-100'
      : accent === 'emerald'
        ? 'ring-emerald-100'
        : accent === 'violet'
          ? 'ring-violet-100'
          : 'ring-slate-100';
  return (
    <article
      className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ${ring}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <p className="mt-4 text-3xl font-semibold tabular-nums text-slate-950">{value}</p>
      <p className="mt-3 text-xs leading-5 text-slate-500">{subtitle}</p>
    </article>
  );
}

export default function Statistics() {
  const { t } = useAdminT();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<StatisticsGrowthResult | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStatsResponse | null>(null);
  const [systemStatsIssue, setSystemStatsIssue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setLoadError(null);
      setSystemStatsIssue(false);
      const [growth, mongoResult] = await Promise.all([
        getStatisticsGrowth(),
        fetchSystemStats(user)
          .then((m): SystemStatsFetchResult => ({ ok: true, m }))
          .catch((e): SystemStatsFetchResult => {
            console.error('[Statistics] fetchSystemStats', e);
            return { ok: false };
          }),
      ]);
      setData(growth);
      if (mongoResult.ok === false) {
        setSystemStats(null);
        setSystemStatsIssue(true);
      } else {
        setSystemStats(mongoResult.m);
      }
    } catch (e) {
      console.error('[Statistics] refresh', e);
      setLoadError(t('admin_stats_err_growth'));
      setData(null);
      setSystemStats(null);
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    if (user && isSuperAdminUser(user)) {
      void refresh();
    }
  }, [refresh, user]);

  const pieData = useMemo(() => {
    const slices: PieSlice[] = data?.segmentation.languageByLabel ?? [];
    if (!slices.length) return [];
    const otherThreshold = 12;
    if (slices.length <= otherThreshold) return slices;
    const head = slices.slice(0, otherThreshold - 1);
    const tail = slices.slice(otherThreshold - 1);
    const otherSum = tail.reduce((a, s) => a + s.value, 0);
    return [...head, { name: `Otros (${tail.length})`, value: otherSum }];
  }, [data?.segmentation.languageByLabel]);

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <p className="text-sm text-slate-500">Cargando sesión…</p>
      </div>
    );
  }

  if (!user || !isSuperAdminUser(user)) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-0 space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">
              Growth · Estadísticas
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Dashboard de crecimiento y producto
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Serie temporal por <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">createdAt</code>.
              Segmentación sobre{' '}
              <strong className="font-medium text-slate-800">todos los documentos</strong> en Firestore{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">users</code>.{' '}
              <strong className="font-medium text-slate-800">Fase 2:</strong> negocio y licencias desde Mongo vía{' '}
              <code className="rounded bg-slate-100 px-1.5 text-xs">GET /api/admin/system-stats</code> (gateway + JWT{' '}
              <code className="rounded bg-slate-100 px-1">admin.system</code>).
              Idioma en perfil: <code className="rounded bg-slate-100 px-1">language</code> /{' '}
              <code className="rounded bg-slate-100 px-1">appLanguage</code>.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? 'Actualizando…' : 'Refrescar'}
          </button>
        </div>
      </section>

      {loadError ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <strong>{t('admin_stats_err_growth')}</strong>
        </section>
      ) : null}

      {systemStatsIssue ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <p className="font-semibold">{t('admin_stats_mongo_failed')}</p>
          <p className="mt-1">{t('admin_stats_mongo_hint')}</p>
        </section>
      ) : null}

      {data?.errors.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <p className="font-semibold">Avisos</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {data.errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          Cargando métricas…
        </div>
      ) : data ? (
        <>
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
              KPIs principales
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                title="Total usuarios"
                value={formatInt(data.overview.usersTotal)}
                subtitle="Firestore · colección users"
                accent="amber"
              />
              <KpiCard
                title="Nuevos hoy (UTC)"
                value={formatInt(data.overview.newUsersTodayUtc)}
                subtitle="Altas desde medianoche UTC · ventana de series en lookback"
                accent="slate"
              />
              <KpiCard
                title="Licencias business activas"
                value={systemStats ? formatInt(systemStats.licenses.active) : '—'}
                subtitle={
                  systemStats
                    ? `Mongo · vencen en 7 d: ${formatInt(systemStats.licenses.expiring_next_7d)} · generado ${new Date(systemStats.generatedAt).toLocaleString('es-ES')}`
                    : 'Requiere API system-stats y ADMIN_SYSTEM_STATS_UIDS en backend.'
                }
                accent="violet"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Producto
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Business cards (Mongo)"
                value={systemStats ? formatInt(systemStats.business_cards_total) : '—'}
                subtitle="Colección business_cards · fuente autoritativa"
                accent="slate"
              />
              <KpiCard
                title="Tarjetas Smart (Firestore)"
                value={formatInt(data.overview.smartCardsTotal)}
                subtitle="collectionGroup users/···/cards"
                accent="emerald"
              />
              <KpiCard
                title="Business cards (Firestore)"
                value={formatInt(data.overview.businessCardsTotal)}
                subtitle="Top-level businessCards · espejo / legado"
                accent="slate"
              />
              <KpiCard
                title="Medallas otorgadas (30 d)"
                value={formatInt(data.overview.medalVotesLast30d)}
                subtitle="Docs en medals/···/votes con votedAt en ventana"
                accent="amber"
              />
            </div>
            {data.productNotes.length ? (
              <ul className="mt-3 list-inside list-disc text-xs text-slate-500">
                {data.productNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : null}
          </section>

          {systemStats ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">
                Tiers · usuarios Mongo por <code className="text-sm">subscriptionPlan</code>
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Sincronización con la colección <code className="rounded bg-slate-100 px-1">users</code> en Mongo.
                La política de precios/límites activa del producto sigue en Firestore{' '}
                <code className="rounded bg-slate-100 px-1">system_config/tiers</code>.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[320px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4 font-medium">Plan</th>
                      <th className="py-2 font-medium">Usuarios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemStats.mongo_users_by_subscription_plan.length ? (
                      systemStats.mongo_users_by_subscription_plan.map((row) => (
                        <tr key={row.subscriptionPlan} className="border-b border-slate-100 last:border-0">
                          <td className="py-3 pr-4 font-medium text-slate-800">{row.subscriptionPlan}</td>
                          <td className="py-3 tabular-nums text-slate-600">{formatInt(row.count)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="py-4 text-slate-400">
                          Sin documentos o el agregado devolvió vacío.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Idioma (perfil)</h2>
              <p className="mt-1 text-sm text-slate-500">
                Usuarios escaneados: {formatInt(data.segmentation.usersScanned)}
              </p>
              <div className="mt-4 h-72 min-h-0 w-full">
                {pieData.length ? (
                  <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={96}
                        paddingAngle={2}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#fff" strokeWidth={1} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [
                          formatInt(typeof value === 'number' ? value : Number(value) || 0),
                          'Usuarios',
                        ]}
                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                      />
                      <Legend
                        layout="horizontal"
                        verticalAlign="bottom"
                        formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Sin datos de idioma
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Top 5 países</h2>
              <p className="mt-1 text-sm text-slate-500">Campo country en users</p>
              <ol className="mt-6 space-y-4">
                {data.segmentation.topCountries.length ? (
                  data.segmentation.topCountries.map((row) => (
                    <li
                      key={row.rank}
                      className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                          {row.rank}
                        </span>
                        <span className="font-medium text-slate-800">{row.country}</span>
                      </div>
                      <span className="tabular-nums text-sm font-semibold text-slate-600">
                        {formatInt(row.count)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-slate-400">Sin datos de país</li>
                )}
              </ol>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Nuevos (24 h)', formatInt(data.overview.newUsersLast24h), 'Ventana móvil'],
              ['Nuevos (7 d)', formatInt(data.overview.newUsersLast7d), 'Lookback parcial'],
              ['BC nuevas (7 d, FS)', formatInt(data.overview.newBusinessCardsLast7d), 'businessCards'],
              ['Usuarios (serie)', '30 d', 'Misma ventana que gráfico diario'],
            ].map(([a, b, c]) => (
              <article key={String(a)} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{a}</p>
                <p className="mt-2 text-xl font-semibold text-slate-900">{b}</p>
                <p className="mt-1 text-xs text-slate-500">{c}</p>
              </article>
            ))}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Usuarios — nuevas altas por día</h2>
            <p className="mt-1 text-sm text-slate-500">Últimos 30 días (UTC)</p>
            <div className="mt-6 h-80 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                <AreaChart data={data.usersDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d97706" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.key ? String(payload[0].payload.key) : ''
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Nuevos usuarios"
                    stroke="#d97706"
                    strokeWidth={2}
                    fill="url(#fillUsers)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Usuarios — nuevas altas por semana</h2>
            <p className="mt-1 text-sm text-slate-500">Semanas en lunes UTC — últimas 12</p>
            <div className="mt-6 h-80 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                <BarChart data={data.usersWeekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.key ? `Semana desde ${String(payload[0].payload.key)}` : ''
                    }
                  />
                  <Bar dataKey="count" name="Nuevos usuarios" fill="#0f172a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Tarjetas de negocio (Firestore) — por día</h2>
            <p className="mt-1 text-sm text-slate-500">
              Nuevos documentos últimos 30 d · últimos 7 d:{' '}
              <strong>{formatInt(data.overview.newBusinessCardsLast7d)}</strong>
            </p>
            <div className="mt-6 h-72 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                <AreaChart data={data.businessCardsDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillBc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.key ? String(payload[0].payload.key) : ''
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Nuevas tarjetas"
                    stroke="#059669"
                    strokeWidth={2}
                    fill="url(#fillBc)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Tarjetas de negocio (Firestore) — por semana</h2>
            <p className="mt-1 text-sm text-slate-500">Últimas 12 semanas (lunes UTC)</p>
            <div className="mt-6 h-72 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                <BarChart data={data.businessCardsWeekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.key ? `Semana desde ${String(payload[0].payload.key)}` : ''
                    }
                  />
                  <Bar dataKey="count" name="Nuevas tarjetas" fill="#047857" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
