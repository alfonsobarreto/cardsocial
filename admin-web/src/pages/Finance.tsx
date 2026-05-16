import { useEffect, useState } from 'react';
import {
  type ActiveSubscription,
  type CsLedgerEvent,
  type FinanceSummary,
  getActiveSubscriptions,
  getCsLedgerEvents,
  getFinanceSummary,
} from '../services/financeService';
import { adminLocaleToBcp47 } from '../i18n/AdminLocaleProvider';
import { useAdminT } from '../i18n/useAdminT';
import { AdminLanguageToggle } from '../components/AdminLanguageToggle';

type Tab = 'subscriptions' | 'cs-bank';
type Toast = { type: 'error'; message: string };

function formatDate(value: unknown, localeTag: string) {
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
  return new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function Finance() {
  const { t, locale } = useAdminT();
  const localeTag = adminLocaleToBcp47(locale);

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
      setToast({ type: 'error', message: t('admin_finance_err_permissions') });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshFinance();
  }, []);

  function displayDate(value: unknown) {
    const s = formatDate(value, localeTag);
    return s === 'N/A' ? t('admin_finance_na') : s;
  }

  const tabs: { id: Tab; labelKey: string; descKey: string }[] = [
    { id: 'subscriptions', labelKey: 'admin_finance_tab_subscriptions', descKey: 'admin_finance_tab_subscriptions_desc' },
    { id: 'cs-bank', labelKey: 'admin_finance_tab_cs_bank', descKey: 'admin_finance_tab_cs_bank_desc' },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-600">
              {t('admin_finance_eyebrow_revenue_ops')}
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">{t('admin_finance_title')}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{t('admin_finance_subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AdminLanguageToggle />
            <button
              type="button"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void refreshFinance()}
            >
              {t('admin_finance_refresh')}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          {tabs.map(({ id, labelKey, descKey }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={[
                'rounded-2xl px-5 py-4 text-left transition',
                activeTab === id
                  ? 'bg-slate-950 text-white shadow-lg'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              <div className="font-semibold">{t(labelKey)}</div>
              <div className={activeTab === id ? 'mt-1 text-xs text-slate-300' : 'mt-1 text-xs text-slate-500'}>
                {t(descKey)}
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
          {t('admin_finance_loading')}
        </div>
      ) : activeTab === 'subscriptions' ? (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{t('admin_finance_kpi_active_subs')}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{summary.activeSubscriptionsCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{t('admin_finance_kpi_mrr')}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{t('admin_finance_placeholder_amount')}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{t('admin_finance_kpi_arr')}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{t('admin_finance_placeholder_amount')}</p>
            </div>
          </div>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{t('admin_finance_table_title_active')}</h2>
            </div>
            {subscriptions.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">{t('admin_finance_empty_subs')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">{t('admin_finance_th_email')}</th>
                      <th className="px-6 py-4 font-semibold">{t('admin_finance_th_tier')}</th>
                      <th className="px-6 py-4 font-semibold">{t('admin_finance_th_expires')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subscriptions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-medium text-slate-900">{sub.email}</td>
                        <td className="px-6 py-4 capitalize text-slate-700">{sub.tier}</td>
                        <td className="px-6 py-4 text-slate-600">{displayDate(sub.premiumUntil)}</td>
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
            <h2 className="text-lg font-semibold text-slate-950">{t('admin_finance_cs_ledger_title')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('admin_finance_cs_ledger_hint')}</p>
          </div>

          {ledger.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">{t('admin_finance_empty_ledger')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">{t('admin_finance_th_date')}</th>
                    <th className="px-6 py-4 font-semibold">{t('admin_finance_th_action')}</th>
                    <th className="px-6 py-4 font-semibold">{t('admin_finance_th_amount_cs')}</th>
                    <th className="px-6 py-4 font-semibold">{t('admin_finance_th_actor')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-4 text-slate-600">{displayDate(event.date)}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{event.action}</td>
                      <td className="px-6 py-4 text-slate-700">
                        {event.amountCs.toLocaleString(localeTag)}
                        {t('admin_finance_suffix_cs')}
                      </td>
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
