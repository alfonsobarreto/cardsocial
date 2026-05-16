import { useEffect, useMemo, useState } from 'react';
import DashboardBudgetTrafficLight from '../components/DashboardBudgetTrafficLight';
import { useAuth } from '../auth/useAuth';
import { isSuperAdminUser } from '../auth/adminAuthGuard';
import { getDashboardStats, type DashboardStats } from '../services/dashboardService';
import { useAdminT } from '../i18n/useAdminT';

export default function Dashboard() {
  const { t } = useAdminT();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadStats() {
      try {
        setLoading(true);
        setLoadError(false);
        const nextStats = await getDashboardStats();

        if (isMounted) {
          setStats(nextStats);
        }
      } catch (error) {
        console.error('[Dashboard] Failed to load Firestore stats:', error);

        if (isMounted) {
          setLoadError(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      isMounted = false;
    };
  }, []);

  const statCards = useMemo(
    () => [
      {
        label: 'Usuarios',
        value: loading ? 'Cargando...' : (stats?.usersCount.toLocaleString() ?? '--'),
        hint: t('admin_dashboard_users_hint'),
      },
      {
        label: 'Reportes',
        value: loading ? 'Cargando...' : (stats?.reportsCount.toLocaleString() ?? '--'),
        hint: t('admin_dashboard_reports_hint'),
      },
      { label: 'Campanas VIP', value: '--', hint: t('admin_dashboard_vip_hint') },
      { label: 'NFC activas', value: '--', hint: t('admin_dashboard_nfc_hint') },
    ],
    [loading, stats, t],
  );

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">
          Founder View
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          Card-Social SuperAdmin
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          Estructura inicial del Admin Core: autenticacion, rutas protegidas, layout y navegacion
          principal. Los modulos operativos se conectaran despues de definir APIs y permisos.
        </p>
      </section>

      {user && isSuperAdminUser(user) ? (
        <DashboardBudgetTrafficLight user={user} />
      ) : (
        <section className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          El semáforo financiero solo visible para la cuenta superadmin (misma política que estadísticas Mongo).
        </section>
      )}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className="mt-4 text-4xl font-semibold text-slate-950">{card.value}</p>
            <p className="mt-3 text-sm text-slate-500">{card.hint}</p>
          </article>
        ))}
      </section>

      {loadError && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {t('admin_dashboard_stats_error')}
        </section>
      )}

      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Modulos preparados en navegacion</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Dashboard, Moderacion, Rules & Tiers, Campanas VIP, Studio, Finanzas y NFC Ops ya
          aparecen en el sidebar como placeholders de arquitectura.
        </p>
      </section>
    </div>
  );
}
