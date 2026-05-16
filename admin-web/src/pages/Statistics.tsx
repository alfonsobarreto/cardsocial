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
  ADMIN_COUNTRY_UNSPECIFIED,
  getStatisticsGrowth,
  type PieSlice,
  type StatisticsGrowthResult,
} from '../services/statsService';
import { type SystemStatsResponse, fetchSystemStats } from '../services/systemStatsService';
import { adminLocaleToBcp47 } from '../i18n/AdminLocaleProvider';
import { useAdminT } from '../i18n/useAdminT';
import { AdminLanguageToggle } from '../components/AdminLanguageToggle';

type SystemStatsFetchResult = { ok: true; m: SystemStatsResponse } | { ok: false };

function formatInt(n: number, localeTag: string): string {
  return n.toLocaleString(localeTag);
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
  const { t, locale } = useAdminT();
  const localeTag = adminLocaleToBcp47(locale);
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<StatisticsGrowthResult | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStatsResponse | null>(null);
  const [systemStatsIssue, setSystemStatsIssue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const chartLocaleTag = adminLocaleToBcp47(locale);
    try {
      setLoading(true);
      setLoadError(null);
      setSystemStatsIssue(false);
      const [growth, mongoResult] = await Promise.all([
        getStatisticsGrowth({ chartLocaleTag }),
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
  }, [user, t, locale]);

  useEffect(() => {
    if (user && isSuperAdminUser(user)) {
      void refresh();
    }
  }, [refresh, user]);

  const pieSlices = useMemo(() => {
    const slices: PieSlice[] = data?.segmentation.languageByLabel ?? [];
    if (!slices.length) return [];
    const otherThreshold = 12;
    if (slices.length <= otherThreshold) return slices;
    const head = slices.slice(0, otherThreshold - 1);
    const tail = slices.slice(otherThreshold - 1);
    const otherSum = tail.reduce((a, s) => a + s.value, 0);
    return [...head, { nameKey: 'admin_stats_pie_other', nameVars: { count: String(tail.length) }, value: otherSum }];
  }, [data?.segmentation.languageByLabel]);

  const pieDataForChart = useMemo(() => {
    return pieSlices.map((s) => ({
      ...s,
      name: t(s.nameKey, s.nameVars),
    }));
  }, [pieSlices, t]);

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <p className="text-sm text-slate-500">{t('admin_stats_loading_session')}</p>
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
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">{t('admin_stats_growth_eyebrow')}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{t('admin_stats_growth_title')}</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{t('admin_stats_growth_intro')}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <AdminLanguageToggle />
            <button
              type="button"
              className="shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? t('admin_stats_refresh_loading') : t('admin_stats_refresh')}
            </button>
          </div>
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
          <p className="font-semibold">{t('admin_stats_warnings_title')}</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {data.errors.map((err, i) => (
              <li key={i}>{t(err.key, err.vars)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          {t('admin_stats_loading_metrics')}
        </div>
      ) : data ? (
        <>
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">{t('admin_stats_kpi_section')}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                title={t('admin_stats_kpi_total_users')}
                value={formatInt(data.overview.usersTotal, localeTag)}
                subtitle={t('admin_stats_kpi_total_users_sub')}
                accent="amber"
              />
              <KpiCard
                title={t('admin_stats_kpi_new_today')}
                value={formatInt(data.overview.newUsersTodayUtc, localeTag)}
                subtitle={t('admin_stats_kpi_new_today_sub')}
                accent="slate"
              />
              <KpiCard
                title={t('admin_stats_kpi_licenses')}
                value={systemStats ? formatInt(systemStats.licenses.active, localeTag) : '—'}
                subtitle={
                  systemStats
                    ? t('admin_stats_kpi_licenses_sub', {
                        exp7: formatInt(systemStats.licenses.expiring_next_7d, localeTag),
                        generated: new Date(systemStats.generatedAt).toLocaleString(localeTag),
                      })
                    : t('admin_stats_kpi_licenses_requires_api')
                }
                accent="violet"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">{t('admin_stats_product_section')}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title={t('admin_stats_kpi_bc_mongo')}
                value={systemStats ? formatInt(systemStats.business_cards_total, localeTag) : '—'}
                subtitle={t('admin_stats_kpi_bc_mongo_sub')}
                accent="slate"
              />
              <KpiCard
                title={t('admin_stats_kpi_smart_fs')}
                value={formatInt(data.overview.smartCardsTotal, localeTag)}
                subtitle={t('admin_stats_kpi_smart_fs_sub')}
                accent="emerald"
              />
              <KpiCard
                title={t('admin_stats_kpi_bc_fs')}
                value={formatInt(data.overview.businessCardsTotal, localeTag)}
                subtitle={t('admin_stats_kpi_bc_fs_sub')}
                accent="slate"
              />
              <KpiCard
                title={t('admin_stats_kpi_medals')}
                value={formatInt(data.overview.medalVotesLast30d, localeTag)}
                subtitle={t('admin_stats_kpi_medals_sub')}
                accent="amber"
              />
            </div>
            {data.productNotes.length ? (
              <ul className="mt-3 list-inside list-disc text-xs text-slate-500">
                {data.productNotes.map((n, i) => (
                  <li key={i}>{t(n.key, n.vars)}</li>
                ))}
              </ul>
            ) : null}
          </section>

          {systemStats ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">{t('admin_stats_tiers_section_title')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('admin_stats_tiers_section_hint')}</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[320px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4 font-medium">{t('admin_stats_th_plan')}</th>
                      <th className="py-2 font-medium">{t('admin_stats_th_users')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemStats.mongo_users_by_subscription_plan.length ? (
                      systemStats.mongo_users_by_subscription_plan.map((row) => (
                        <tr key={row.subscriptionPlan} className="border-b border-slate-100 last:border-0">
                          <td className="py-3 pr-4 font-medium text-slate-800">{row.subscriptionPlan}</td>
                          <td className="py-3 tabular-nums text-slate-600">{formatInt(row.count, localeTag)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="py-4 text-slate-400">
                          {t('admin_stats_tiers_empty')}
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
              <h2 className="text-lg font-semibold text-slate-950">{t('admin_stats_lang_chart_title')}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t('admin_stats_users_scanned', { count: formatInt(data.segmentation.usersScanned, localeTag) })}
              </p>
              <div className="mt-4 h-72 min-h-0 w-full">
                {pieDataForChart.length ? (
                  <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                    <PieChart>
                      <Pie
                        data={pieDataForChart}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={96}
                        paddingAngle={2}
                      >
                        {pieDataForChart.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#fff" strokeWidth={1} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [
                          formatInt(typeof value === 'number' ? value : Number(value) || 0, localeTag),
                          t('admin_stats_tooltip_users_plural'),
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
                    {t('admin_stats_lang_empty')}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">{t('admin_stats_top_countries_title')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('admin_stats_top_countries_hint')}</p>
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
                        <span className="font-medium text-slate-800">
                          {row.country === ADMIN_COUNTRY_UNSPECIFIED ? t('admin_stats_country_unspecified') : row.country}
                        </span>
                      </div>
                      <span className="tabular-nums text-sm font-semibold text-slate-600">
                        {formatInt(row.count, localeTag)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-slate-400">{t('admin_stats_country_empty')}</li>
                )}
              </ol>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('admin_stats_mini_new_24h')}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{formatInt(data.overview.newUsersLast24h, localeTag)}</p>
              <p className="mt-1 text-xs text-slate-500">{t('admin_stats_mini_new_24h_sub')}</p>
            </article>
            <article className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('admin_stats_mini_new_7d')}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{formatInt(data.overview.newUsersLast7d, localeTag)}</p>
              <p className="mt-1 text-xs text-slate-500">{t('admin_stats_mini_new_7d_sub')}</p>
            </article>
            <article className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('admin_stats_mini_bc_7d')}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {formatInt(data.overview.newBusinessCardsLast7d, localeTag)}
              </p>
              <p className="mt-1 text-xs text-slate-500">{t('admin_stats_mini_bc_7d_sub')}</p>
            </article>
            <article className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('admin_stats_mini_series_label')}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{t('admin_stats_mini_series_value')}</p>
              <p className="mt-1 text-xs text-slate-500">{t('admin_stats_mini_series_sub')}</p>
            </article>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">{t('admin_stats_chart_users_daily_title')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('admin_stats_chart_users_daily_sub')}</p>
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
                    name={t('admin_stats_series_new_users')}
                    stroke="#d97706"
                    strokeWidth={2}
                    fill="url(#fillUsers)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">{t('admin_stats_chart_users_weekly_title')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('admin_stats_chart_users_weekly_sub')}</p>
            <div className="mt-6 h-80 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                <BarChart data={data.usersWeekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.key
                        ? t('admin_stats_week_from', { date: String(payload[0].payload.key) })
                        : ''
                    }
                  />
                  <Bar
                    dataKey="count"
                    name={t('admin_stats_series_new_users')}
                    fill="#0f172a"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">{t('admin_stats_chart_bc_daily_title')}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t('admin_stats_chart_bc_daily_sub', { last7: formatInt(data.overview.newBusinessCardsLast7d, localeTag) })}
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
                    name={t('admin_stats_series_new_cards')}
                    stroke="#059669"
                    strokeWidth={2}
                    fill="url(#fillBc)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">{t('admin_stats_chart_bc_weekly_title')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('admin_stats_chart_bc_weekly_sub')}</p>
            <div className="mt-6 h-72 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%" minHeight={1}>
                <BarChart data={data.businessCardsWeekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.key
                        ? t('admin_stats_week_from', { date: String(payload[0].payload.key) })
                        : ''
                    }
                  />
                  <Bar
                    dataKey="count"
                    name={t('admin_stats_series_new_cards')}
                    fill="#047857"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
