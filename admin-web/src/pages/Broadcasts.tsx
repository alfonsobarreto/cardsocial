import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { isSuperAdminUser } from '../auth/adminAuthGuard';
import { useAuth } from '../auth/useAuth';
import { useAdminT } from '../i18n/useAdminT';
import {
  SYSTEM_BROADCAST_TEMPLATE_IDS,
  createSystemBroadcast,
  deactivateSystemBroadcast,
  listSystemBroadcasts,
  type SystemBroadcast,
  type SystemBroadcastTemplateId,
} from '../services/systemBroadcastService';

function formatTs(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export default function Broadcasts() {
  const { t } = useAdminT();
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<SystemBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<SystemBroadcastTemplateId>('SYS_GLOBAL_MAINTENANCE');
  const [expiryDate, setExpiryDate] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSystemBroadcasts();
      setRows(list);
    } catch (e) {
      console.error('[Broadcasts]', e);
      setError(t('admin_megaphone_err_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const publish = async () => {
    if (!user) return;
    setBusy('publish');
    setError(null);
    try {
      let expiresAt: Date | null = null;
      if (expiryDate.trim()) {
        const parsed = new Date(expiryDate);
        if (Number.isNaN(parsed.getTime())) {
          setError(t('admin_megaphone_err_date'));
          return;
        }
        expiresAt = parsed;
      }
      await createSystemBroadcast({ templateId, expiresAt });
      await refresh();
    } catch (e) {
      console.error('[Broadcasts] publish', e);
      setError(t('admin_megaphone_err_publish'));
    } finally {
      setBusy('');
    }
  };

  const deactivate = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await deactivateSystemBroadcast(id);
      await refresh();
    } catch (e) {
      console.error('[Broadcasts] deactivate', e);
      setError(t('admin_megaphone_err_deactivate'));
    } finally {
      setBusy('');
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <p className="text-sm text-slate-500">{t('admin_megaphone_loading')}</p>
      </div>
    );
  }

  if (!user || !isSuperAdminUser(user)) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/50 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">{t('admin_megaphone_eyebrow')}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{t('admin_megaphone_title')}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{t('admin_megaphone_lead')}</p>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : null}

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">{t('admin_megaphone_compose_title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('admin_megaphone_compose_hint')}</p>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('admin_megaphone_field_template')}
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value as SystemBroadcastTemplateId)}
            >
              {SYSTEM_BROADCAST_TEMPLATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('admin_megaphone_field_expires')}
            <input
              type="datetime-local"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">{t('admin_megaphone_expires_optional')}</p>

          <button
            type="button"
            disabled={Boolean(busy)}
            className="mt-6 rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-amber-700 disabled:opacity-50"
            onClick={() => void publish()}
          >
            {busy === 'publish' ? '…' : t('admin_megaphone_publish')}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">{t('admin_megaphone_list_title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('admin_megaphone_list_hint')}</p>

          {loading ? (
            <p className="mt-8 text-center text-sm text-slate-500">…</p>
          ) : rows.length === 0 ? (
            <p className="mt-8 text-center text-sm text-slate-500">{t('admin_megaphone_empty')}</p>
          ) : (
            <ul className="mt-4 max-h-[28rem] divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-slate-500">{r.id}</p>
                    <p className="font-semibold text-slate-900">{r.templateId}</p>
                    <p className="text-xs text-slate-600">
                      {t('admin_megaphone_created')}: {formatTs(r.createdAt)}
                      {r.expiresAt ? ` · ${t('admin_megaphone_expires')}: ${formatTs(r.expiresAt)}` : ''}
                    </p>
                    <p className="mt-1 text-xs font-medium">
                      {r.isActive ? (
                        <span className="text-emerald-700">{t('admin_megaphone_status_active')}</span>
                      ) : (
                        <span className="text-slate-500">{t('admin_megaphone_status_inactive')}</span>
                      )}
                    </p>
                  </div>
                  {r.isActive ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                      onClick={() => void deactivate(r.id)}
                    >
                      {busy === r.id ? '…' : t('admin_megaphone_deactivate')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
