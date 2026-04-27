import { useEffect, useState } from 'react';
import {
  type ActiveSubscription,
  type CsLedgerEvent,
  type FinanceSummary,
  getActiveSubscriptions,
  getCsLedgerEvents,
  getFinanceSummary,
} from '../services/financeService';

type Tab = 'subscriptions' | 'cs-bank';
type Toast = { type: 'error'; message: string };

function formatDate(value: unknown) {
  if (!value) return 'N/A';
  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    date = new Date(value);
  } else if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') {
    date = value.toDate();
  } else if (typeof value === 'object' && value && 'seconds' in value && typeof value.seconds === 'number') {
    date = new Date(value.seconds * 1000);
  }

  if (!date || Number.isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function Finance() {
  const [activeTab, setActiveTab] = useState<Tab>('subscriptions');
  const [summary, setSummary] = useState<FinanceSummary>({ activeSubscriptionsCount: 0 });
  const [subscriptions, setSubscriptions] = useState<ActiveSubscription[]>([]);
  const [ledger, setLedger] = useState<CsLedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  async function refreshFinance() {
    try {
      setLoading(true);
      setToast(null);
      const [nextSummary, nextSubscriptions, nextLedger] = await Promise.all([
        getFinanceSummary(),
        getActiveSubscriptions(),
        getCsLedgerEvents(),
      ]);
      setSummary(nextSummary);
      setSubscriptions(nextSubscriptions);
      setLedger(nextLedger);
    } catch (error) {
      console.error('[Finance] Failed to load:', error);
      setToast({ type: 'error', message: 'No se pudo cargar Revenue Ops. Revisa permisos/índices de Firestore.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshFinance();
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-600">
              Revenue Ops
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">Finanzas & Revenue</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Vista CFO para suscripciones activas y auditoría del pasivo de CS Coins.
            </p>
          </div>
          <button
            type="button"
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => void refreshFinance()}
          >
            Refrescar
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          {[
            ['subscriptions', 'Suscripciones (Ingresos)', 'Dinero real y estado premium'],
            ['cs-bank', 'Banco Central CS', 'Moneda virtual y pasivo'],
          ].map(([key, label, description]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as Tab)}
              className={[
                'rounded-2xl px-5 py-4 text-left transition',
                activeTab === key
                  ? 'bg-slate-950 text-white shadow-lg'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              <div className="font-semibold">{label}</div>
              <div className={activeTab === key ? 'mt-1 text-xs text-slate-300' : 'mt-1 text-xs text-slate-500'}>
                {description}
              </div>
            </button>
          ))}
        </div>
      </section>

      {toast && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {toast.message}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-16 text-center text-sm text-slate-500">
          Cargando módulo financiero...
        </div>
      ) : activeTab === 'subscriptions' ? (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Suscripciones Activas</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{summary.activeSubscriptionsCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">MRR Estimado</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">$---</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">ARR Estimado</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">$---</p>
            </div>
          </div>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Usuarios con subscriptionStatus active</h2>
            </div>
            {subscriptions.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">No hay suscripciones activas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Email</th>
                      <th className="px-6 py-4 font-semibold">Tier Actual</th>
                      <th className="px-6 py-4 font-semibold">Expira</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subscriptions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-medium text-slate-900">{sub.email}</td>
                        <td className="px-6 py-4 capitalize text-slate-700">{sub.tier}</td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(sub.premiumUntil)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Últimos movimientos del Banco Central CS</h2>
            <p className="mt-1 text-sm text-slate-500">
              Combina `admin_audit` y `redemption_logs` para ver emisión/canje de CS Coins.
            </p>
          </div>

          {ledger.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">No hay movimientos registrados.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Fecha</th>
                    <th className="px-6 py-4 font-semibold">Acción</th>
                    <th className="px-6 py-4 font-semibold">Monto CS Coins</th>
                    <th className="px-6 py-4 font-semibold">Usuario/Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-4 text-slate-600">{formatDate(event.date)}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{event.action}</td>
                      <td className="px-6 py-4 text-slate-700">{event.amountCs.toLocaleString()} CS</td>
                      <td className="px-6 py-4 text-slate-600">{event.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
