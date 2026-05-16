import { type FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useAdminT } from '../i18n/useAdminT';
import { adminLocaleToBcp47 } from '../i18n/AdminLocaleProvider';
import {
  type BannedIdentity,
  type RiskUser,
  addBannedIdentity,
  findRiskUser,
  getBannedIdentities,
  removeBannedIdentity,
  setUserVerification,
} from '../services/identityRiskService';

type Tab = 'verification' | 'blacklist';
type Toast = { type: 'success' | 'error'; message: string };

function formatDate(value: unknown, bcp47: string) {
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
  return new Intl.DateTimeFormat(bcp47, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function IdentityRisk() {
  const { t, locale } = useAdminT();
  const { user } = useAuth();
  const bcp47 = adminLocaleToBcp47(locale);
  const [activeTab, setActiveTab] = useState<Tab>('verification');
  const [search, setSearch] = useState('');
  const [riskUser, setRiskUser] = useState<RiskUser | null>(null);
  const [blacklist, setBlacklist] = useState<BannedIdentity[]>([]);
  const [blacklistEmail, setBlacklistEmail] = useState('');
  const [blacklistReason, setBlacklistReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [blacklistLoading, setBlacklistLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  const adminEmail = user?.email || 'unknown-admin';

  async function refreshBlacklist() {
    try {
      setBlacklistLoading(true);
      setBlacklist(await getBannedIdentities());
    } catch (error) {
      console.error('[IdentityRisk] Failed to load blacklist:', error);
      setToast({ type: 'error', message: t('admin_idrisk_load_blacklist_fail') });
    } finally {
      setBlacklistLoading(false);
    }
  }

  useEffect(() => {
    void refreshBlacklist();
  }, []);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setToast(null);
    setRiskUser(null);

    try {
      const result = await findRiskUser(search);
      if (!result) {
        setToast({ type: 'error', message: t('admin_idrisk_user_not_found') });
        return;
      }
      setRiskUser(result);
    } catch (error) {
      console.error('[IdentityRisk] Search failed:', error);
      setToast({ type: 'error', message: t('admin_idrisk_search_fail') });
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = async (isVerified: boolean) => {
    if (!riskUser) return;
    setActionLoading(isVerified ? 'verify' : 'revoke');
    setToast(null);

    try {
      await setUserVerification(riskUser.uid, isVerified, adminEmail);
      setRiskUser({ ...riskUser, isVerified, verifiedAt: isVerified ? new Date() : null });
      setToast({
        type: 'success',
        message: isVerified ? t('admin_idrisk_verify_granted') : t('admin_idrisk_verify_revoked'),
      });
    } catch (error) {
      console.error('[IdentityRisk] Verification update failed:', error);
      setToast({ type: 'error', message: t('admin_idrisk_verify_fail') });
    } finally {
      setActionLoading('');
    }
  };

  const handleAddBlacklist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionLoading('blacklist-add');
    setToast(null);

    try {
      await addBannedIdentity({
        email: blacklistEmail,
        reason: blacklistReason.trim() || t('admin_idrisk_default_reason'),
        createdBy: adminEmail,
      });
      setBlacklistEmail('');
      setBlacklistReason('');
      await refreshBlacklist();
      setToast({ type: 'success', message: t('admin_idrisk_blacklist_add_ok') });
    } catch (error) {
      console.error('[IdentityRisk] Add blacklist failed:', error);
      setToast({ type: 'error', message: t('admin_idrisk_blacklist_add_fail') });
    } finally {
      setActionLoading('');
    }
  };

  const handleRemoveBlacklist = async (entry: BannedIdentity) => {
    setActionLoading(`remove:${entry.id}`);
    setToast(null);

    try {
      await removeBannedIdentity(entry.id);
      await refreshBlacklist();
      setToast({ type: 'success', message: t('admin_idrisk_blacklist_remove_ok') });
    } catch (error) {
      console.error('[IdentityRisk] Remove blacklist failed:', error);
      setToast({ type: 'error', message: t('admin_idrisk_blacklist_remove_fail') });
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">{t('admin_idrisk_eyebrow')}</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">{t('admin_idrisk_title')}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{t('admin_idrisk_lead')}</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          {(
            [
              ['verification', t('admin_idrisk_tab_verify_label'), t('admin_idrisk_tab_verify_desc')],
              ['blacklist', t('admin_idrisk_tab_blacklist_label'), t('admin_idrisk_tab_blacklist_desc')],
            ] as const
          ).map(([key, label, description]) => (
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
        <div
          className={[
            'rounded-2xl border px-5 py-4 text-sm font-medium',
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700',
          ].join(' ')}
        >
          {toast.message}
        </div>
      )}

      {activeTab === 'verification' ? (
        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSearch}>
            <h2 className="text-xl font-semibold text-slate-950">{t('admin_idrisk_search_title')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('admin_idrisk_search_helper')}</p>
            <input
              className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              value={search}
              onChange={(re) => setSearch(re.target.value)}
              placeholder={t('admin_idrisk_search_placeholder')}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? t('admin_idrisk_search_loading') : t('admin_idrisk_search_submit')}
            </button>
          </form>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {!riskUser ? (
              <div className="py-16 text-center text-sm text-slate-500">{t('admin_idrisk_empty_search')}</div>
            ) : (
              <div>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                      {t('admin_idrisk_account_label')}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-950">{riskUser.displayName}</h2>
                    <p className="mt-1 break-all text-sm text-slate-600">
                      {riskUser.email || t('admin_idrisk_email_unavailable_short')}
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-400">{riskUser.uid}</p>
                  </div>
                  <span
                    className={[
                      'rounded-full px-3 py-1 text-xs font-semibold',
                      riskUser.isVerified ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700',
                    ].join(' ')}
                  >
                    {riskUser.isVerified ? t('admin_idrisk_badge_verified') : t('admin_idrisk_badge_unverified')}
                  </span>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('admin_idrisk_phone_label')}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{riskUser.phoneNumber || t('admin_idrisk_phone_none')}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {t('admin_idrisk_verified_at_label')}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(riskUser.verifiedAt, bcp47)}</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={Boolean(actionLoading) || riskUser.isVerified}
                    className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                    onClick={() => void handleVerification(true)}
                  >
                    {actionLoading === 'verify' ? t('admin_idrisk_btn_verify_loading') : t('admin_idrisk_btn_verify')}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(actionLoading) || !riskUser.isVerified}
                    className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => void handleVerification(false)}
                  >
                    {actionLoading === 'revoke' ? t('admin_idrisk_btn_revoke_loading') : t('admin_idrisk_btn_revoke')}
                  </button>
                </div>
              </div>
            )}
          </section>
        </section>
      ) : (
        <section className="space-y-6">
          <form className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm" onSubmit={handleAddBlacklist}>
            <h2 className="text-xl font-semibold text-slate-950">{t('admin_idrisk_blacklist_form_title')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('admin_idrisk_blacklist_form_helper')}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100"
                value={blacklistEmail}
                onChange={(re) => setBlacklistEmail(re.target.value)}
                placeholder={t('admin_idrisk_blacklist_email_ph')}
                type="email"
                required
              />
              <input
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100"
                value={blacklistReason}
                onChange={(re) => setBlacklistReason(re.target.value)}
                placeholder={t('admin_idrisk_default_reason')}
              />
              <button
                type="submit"
                disabled={actionLoading === 'blacklist-add'}
                className="rounded-xl bg-red-700 px-5 py-2.5 text-sm font-black text-white hover:bg-red-800 disabled:opacity-60"
              >
                {actionLoading === 'blacklist-add' ? t('admin_idrisk_blacklist_submit_loading') : t('admin_idrisk_blacklist_submit')}
              </button>
            </div>
          </form>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{t('admin_idrisk_table_title')}</h2>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void refreshBlacklist()}
              >
                {t('admin_idrisk_table_refresh')}
              </button>
            </div>

            {blacklistLoading ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">{t('admin_idrisk_table_loading')}</div>
            ) : blacklist.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">{t('admin_idrisk_table_empty')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">{t('admin_idrisk_col_email')}</th>
                      <th className="px-6 py-4 font-semibold">{t('admin_idrisk_col_phone')}</th>
                      <th className="px-6 py-4 font-semibold">{t('admin_idrisk_col_date')}</th>
                      <th className="px-6 py-4 font-semibold">{t('admin_idrisk_col_admin')}</th>
                      <th className="px-6 py-4 font-semibold">{t('admin_idrisk_col_reason')}</th>
                      <th className="px-6 py-4 font-semibold">{t('admin_idrisk_col_action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {blacklist.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-medium text-slate-900">{entry.email || 'N/A'}</td>
                        <td className="px-6 py-4 text-slate-600">{entry.phoneNumber || 'N/A'}</td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(entry.createdAt, bcp47)}</td>
                        <td className="px-6 py-4 text-slate-700">{entry.createdBy}</td>
                        <td className="px-6 py-4 text-slate-600">{entry.reason || 'N/A'}</td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            disabled={Boolean(actionLoading)}
                            className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            onClick={() => void handleRemoveBlacklist(entry)}
                          >
                            {actionLoading === `remove:${entry.id}` ? t('admin_idrisk_remove_loading') : t('admin_idrisk_remove')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      )}
    </div>
  );
}
