import { type FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
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

export default function IdentityRisk() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('verification');
  const [search, setSearch] = useState('');
  const [riskUser, setRiskUser] = useState<RiskUser | null>(null);
  const [blacklist, setBlacklist] = useState<BannedIdentity[]>([]);
  const [blacklistEmail, setBlacklistEmail] = useState('');
  const [blacklistReason, setBlacklistReason] = useState('Proactive abuse prevention');
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
      setToast({ type: 'error', message: 'No se pudo cargar banned_identities.' });
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
        setToast({ type: 'error', message: 'No se encontró usuario con ese email o UID.' });
        return;
      }
      setRiskUser(result);
    } catch (error) {
      console.error('[IdentityRisk] Search failed:', error);
      setToast({ type: 'error', message: 'No se pudo buscar el usuario.' });
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
        message: isVerified ? 'Blue Badge otorgado.' : 'Verificación revocada.',
      });
    } catch (error) {
      console.error('[IdentityRisk] Verification update failed:', error);
      setToast({ type: 'error', message: 'No se pudo actualizar la verificación.' });
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
        reason: blacklistReason,
        createdBy: adminEmail,
      });
      setBlacklistEmail('');
      setBlacklistReason('Proactive abuse prevention');
      await refreshBlacklist();
      setToast({ type: 'success', message: 'Identidad agregada a lista negra.' });
    } catch (error) {
      console.error('[IdentityRisk] Add blacklist failed:', error);
      setToast({ type: 'error', message: 'No se pudo agregar a lista negra.' });
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
      setToast({ type: 'success', message: 'Identidad retirada de lista negra.' });
    } catch (error) {
      console.error('[IdentityRisk] Remove blacklist failed:', error);
      setToast({ type: 'error', message: 'No se pudo retirar de lista negra.' });
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">
          Identity Risk & Verification
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Identidad y Anti-Abuso</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Otorga el sello oficial a cuentas confiables y administra la lista negra global para prevenir
          registros abusivos o evasión de hard bans.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          {[
            ['verification', 'Verificación de Cuentas', 'Blue Badge para perfiles confiables'],
            ['blacklist', 'Lista Negra (Blacklist)', 'banned_identities global'],
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
            <h2 className="text-xl font-semibold text-slate-950">Buscar cuenta</h2>
            <p className="mt-1 text-sm text-slate-500">Busca por email o UID para revisar su estado de verificación.</p>
            <input
              className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="email@dominio.com o UID"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
          </form>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {!riskUser ? (
              <div className="py-16 text-center text-sm text-slate-500">Busca una cuenta para gestionar su Blue Badge.</div>
            ) : (
              <div>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Cuenta</p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-950">{riskUser.displayName}</h2>
                    <p className="mt-1 break-all text-sm text-slate-600">{riskUser.email || 'Email no disponible'}</p>
                    <p className="mt-1 font-mono text-xs text-slate-400">{riskUser.uid}</p>
                  </div>
                  <span
                    className={[
                      'rounded-full px-3 py-1 text-xs font-semibold',
                      riskUser.isVerified ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700',
                    ].join(' ')}
                  >
                    {riskUser.isVerified ? 'Verified Blue Badge' : 'No verificado'}
                  </span>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Teléfono</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{riskUser.phoneNumber || 'No registrado'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Verificado en</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(riskUser.verifiedAt)}</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={Boolean(actionLoading) || riskUser.isVerified}
                    className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                    onClick={() => void handleVerification(true)}
                  >
                    {actionLoading === 'verify' ? 'Otorgando...' : 'Otorgar Verificación (Blue Badge)'}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(actionLoading) || !riskUser.isVerified}
                    className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => void handleVerification(false)}
                  >
                    {actionLoading === 'revoke' ? 'Revocando...' : 'Revocar Verificación'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </section>
      ) : (
        <section className="space-y-6">
          <form className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm" onSubmit={handleAddBlacklist}>
            <h2 className="text-xl font-semibold text-slate-950">Agregar a Lista Negra Proactiva</h2>
            <p className="mt-1 text-sm text-slate-500">
              Crea un registro en banned_identities para que backend/Auth lo rechacen en el futuro.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100"
                value={blacklistEmail}
                onChange={(event) => setBlacklistEmail(event.target.value)}
                placeholder="Email a bloquear"
                type="email"
                required
              />
              <input
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100"
                value={blacklistReason}
                onChange={(event) => setBlacklistReason(event.target.value)}
                placeholder="Motivo"
              />
              <button
                type="submit"
                disabled={actionLoading === 'blacklist-add'}
                className="rounded-xl bg-red-700 px-5 py-2.5 text-sm font-black text-white hover:bg-red-800 disabled:opacity-60"
              >
                {actionLoading === 'blacklist-add' ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </form>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">banned_identities</h2>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void refreshBlacklist()}
              >
                Refrescar
              </button>
            </div>

            {blacklistLoading ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">Cargando lista negra...</div>
            ) : blacklist.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">No hay identidades bloqueadas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Email</th>
                      <th className="px-6 py-4 font-semibold">Teléfono</th>
                      <th className="px-6 py-4 font-semibold">Fecha</th>
                      <th className="px-6 py-4 font-semibold">Admin</th>
                      <th className="px-6 py-4 font-semibold">Motivo</th>
                      <th className="px-6 py-4 font-semibold">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {blacklist.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-medium text-slate-900">{entry.email || 'N/A'}</td>
                        <td className="px-6 py-4 text-slate-600">{entry.phoneNumber || 'N/A'}</td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(entry.createdAt)}</td>
                        <td className="px-6 py-4 text-slate-700">{entry.createdBy}</td>
                        <td className="px-6 py-4 text-slate-600">{entry.reason || 'N/A'}</td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            disabled={Boolean(actionLoading)}
                            className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            onClick={() => void handleRemoveBlacklist(entry)}
                          >
                            {actionLoading === `remove:${entry.id}` ? 'Quitando...' : 'Perdonar / Quitar'}
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
