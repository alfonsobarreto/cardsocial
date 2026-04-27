import { type FormEvent, useEffect, useState } from 'react';
import {
  type Affiliate,
  type GlobalAnnouncement,
  createAffiliate,
  getAffiliates,
  getGlobalAnnouncement,
  updateGlobalAnnouncement,
} from '../services/growthService';

type Tab = 'broadcast' | 'affiliates';
type Toast = { type: 'success' | 'error'; message: string };

function formatDate(value: Affiliate['createdAt']) {
  if (!value) return 'Pendiente';
  const date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate() : null;
  if (!date) return 'Pendiente';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function Growth() {
  const [activeTab, setActiveTab] = useState<Tab>('broadcast');
  const [announcement, setAnnouncement] = useState<GlobalAnnouncement>({
    title: '',
    message: '',
    targetUrl: '',
    isActive: false,
  });
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [creatorEmail, setCreatorEmail] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [commissionPercent, setCommissionPercent] = useState(20);

  async function refreshGrowth() {
    try {
      setLoading(true);
      const [nextAnnouncement, nextAffiliates] = await Promise.all([
        getGlobalAnnouncement(),
        getAffiliates(),
      ]);
      setAnnouncement(nextAnnouncement);
      setAffiliates(nextAffiliates);
    } catch (error) {
      console.error('[Growth] Failed to load:', error);
      setToast({ type: 'error', message: 'No se pudo cargar Growth & Afiliados.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshGrowth();
  }, []);

  useEffect(() => {
    if (!toast || toast.type !== 'success') return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleSaveAnnouncement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setToast(null);

    try {
      await updateGlobalAnnouncement(announcement);
      setToast({ type: 'success', message: 'Anuncio global actualizado en system_config/main.' });
    } catch (error) {
      console.error('[Growth] Save announcement failed:', error);
      setToast({ type: 'error', message: 'No se pudo guardar el anuncio global.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAffiliate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setToast(null);

    try {
      await createAffiliate({ creatorEmail, referralCode, commissionPercent });
      setCreatorEmail('');
      setReferralCode('');
      setCommissionPercent(20);
      setAffiliates(await getAffiliates());
      setToast({ type: 'success', message: 'Afiliado registrado y listo para tracking.' });
    } catch (error) {
      console.error('[Growth] Create affiliate failed:', error);
      setToast({ type: 'error', message: 'No se pudo registrar el afiliado.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-fuchsia-600">
          Growth & Lifecycle Automation
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Growth & Afiliados</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Administra mensajes globales en la app y prepara la base de datos para referral tracking.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          {[
            ['broadcast', 'Anuncios Globales (Broadcast)', 'Mensaje activo para app móvil'],
            ['affiliates', 'Programa de Afiliados', 'Códigos de referido y métricas base'],
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

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-16 text-center text-sm text-slate-500">
          Cargando growth console...
        </div>
      ) : activeTab === 'broadcast' ? (
        <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSaveAnnouncement}>
          <h2 className="text-xl font-semibold text-slate-950">Anuncio Global Activo</h2>
          <p className="mt-1 text-sm text-slate-500">
            La app móvil puede leer este bloque desde <code>system_config/main</code>.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Título del anuncio</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-fuchsia-500 focus:bg-white focus:ring-4 focus:ring-fuchsia-100"
                value={announcement.title}
                onChange={(event) => setAnnouncement((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Nuevo drop disponible"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Mensaje corto</span>
              <textarea
                className="mt-1.5 min-h-28 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-fuchsia-500 focus:bg-white focus:ring-4 focus:ring-fuchsia-100"
                value={announcement.message}
                onChange={(event) => setAnnouncement((prev) => ({ ...prev, message: event.target.value }))}
                placeholder="Desbloquea nuevos themes premium por tiempo limitado."
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">URL de destino opcional</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-fuchsia-500 focus:bg-white focus:ring-4 focus:ring-fuchsia-100"
                value={announcement.targetUrl}
                onChange={(event) => setAnnouncement((prev) => ({ ...prev, targetUrl: event.target.value }))}
                placeholder="https://cardsocial.me/themes/new-drop"
              />
            </label>

            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Mostrar Anuncio Activo</p>
                <p className="text-xs text-slate-500">Activa o apaga el broadcast global sin redeploy.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={announcement.isActive}
                className={[
                  'relative h-8 w-14 rounded-full transition',
                  announcement.isActive ? 'bg-fuchsia-500' : 'bg-slate-300',
                ].join(' ')}
                onClick={() => setAnnouncement((prev) => ({ ...prev, isActive: !prev.isActive }))}
              >
                <span
                  className={[
                    'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition',
                    announcement.isActive ? 'left-7' : 'left-1',
                  ].join(' ')}
                />
              </button>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar Broadcast'}
            </button>
          </div>
        </form>
      ) : (
        <section className="space-y-6">
          <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleCreateAffiliate}>
            <h2 className="text-xl font-semibold text-slate-950">Registrar afiliado</h2>
            <p className="mt-1 text-sm text-slate-500">Crea un código para attribution futura en backend.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_160px_auto]">
              <input
                type="email"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-fuchsia-500 focus:bg-white focus:ring-4 focus:ring-fuchsia-100"
                value={creatorEmail}
                onChange={(event) => setCreatorEmail(event.target.value)}
                placeholder="creator@email.com"
                required
              />
              <input
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm uppercase outline-none focus:border-fuchsia-500 focus:bg-white focus:ring-4 focus:ring-fuchsia-100"
                value={referralCode}
                onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                placeholder="JUAN20"
                required
              />
              <input
                type="number"
                min={0}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-fuchsia-500 focus:bg-white focus:ring-4 focus:ring-fuchsia-100"
                value={commissionPercent}
                onChange={(event) => setCommissionPercent(Number.parseFloat(event.target.value) || 0)}
                placeholder="% comisión"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </form>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Afiliados</h2>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void refreshGrowth()}
              >
                Refrescar
              </button>
            </div>

            {affiliates.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">No hay afiliados registrados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Creador</th>
                      <th className="px-6 py-4 font-semibold">Código</th>
                      <th className="px-6 py-4 font-semibold">Comisión</th>
                      <th className="px-6 py-4 font-semibold">Clics</th>
                      <th className="px-6 py-4 font-semibold">Signups</th>
                      <th className="px-6 py-4 font-semibold">Creado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {affiliates.map((affiliate) => (
                      <tr key={affiliate.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-medium text-slate-900">{affiliate.creatorEmail}</td>
                        <td className="px-6 py-4">
                          <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">
                            {affiliate.referralCode}
                          </code>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{affiliate.commissionPercent}%</td>
                        <td className="px-6 py-4 text-slate-700">{affiliate.clicks}</td>
                        <td className="px-6 py-4 text-slate-700">{affiliate.signups}</td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(affiliate.createdAt)}</td>
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
