import { type FormEvent, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  type VipCampaign,
  type VipCampaignType,
  type VipGrantedTier,
  createCampaign,
  getCampaigns,
  toggleCampaignStatus,
} from '../services/campaignsService';

type Toast = { type: 'success' | 'error'; message: string };

const TIER_OPTIONS: { label: string; type: VipCampaignType; grantedTier: VipGrantedTier }[] = [
  { label: 'Influencer (365 días)', type: 'Influencer', grantedTier: 'influencer' },
  { label: 'Business / Negocio (365 días)', type: 'Business', grantedTier: 'business' },
];

function qrValueForCampaign(campaign: VipCampaign) {
  return `cardsocial://redeem?campaignCode=${encodeURIComponent(campaign.refCode)}`;
}

function formatDate(value: VipCampaign['createdAt']) {
  if (!value) return 'Pendiente';
  const date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate() : null;
  if (!date) return 'Pendiente';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<VipCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [qrModalCampaign, setQrModalCampaign] = useState<VipCampaign | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  const [formName, setFormName] = useState('');
  const [formTierKey, setFormTierKey] = useState<VipGrantedTier>('influencer');
  const [formMaxUses, setFormMaxUses] = useState(50);

  const selectedTierOption = TIER_OPTIONS.find((option) => option.grantedTier === formTierKey) ?? TIER_OPTIONS[0];

  async function refreshCampaigns() {
    try {
      setLoading(true);
      const list = await getCampaigns();
      setCampaigns(list);
    } catch (error) {
      console.error('[Campaigns] Failed to load campaigns:', error);
      setToast({ type: 'error', message: 'No se pudieron cargar las campañas VIP.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const list = await getCampaigns();
        if (isMounted) setCampaigns(list);
      } catch (error) {
        console.error('[Campaigns] Failed to load campaigns:', error);
        if (isMounted) {
          setToast({ type: 'error', message: 'No se pudieron cargar las campañas VIP.' });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toast || toast.type !== 'success') return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const openCreateModal = () => {
    setFormName('');
    setFormTierKey('influencer');
    setFormMaxUses(50);
    setModalOpen(true);
    setToast(null);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = formName.trim();

    if (!name) {
      setToast({ type: 'error', message: 'El nombre de la campaña es obligatorio.' });
      return;
    }

    setSubmitting(true);
    setToast(null);

    try {
      await createCampaign({
        name,
        type: selectedTierOption.type,
        grantedTier: selectedTierOption.grantedTier,
        maxUses: formMaxUses,
      });

      await refreshCampaigns();
      setModalOpen(false);
      setToast({ type: 'success', message: 'Campaña VIP creada con tier de 365 días.' });
    } catch (error) {
      console.error('[Campaigns] Create failed:', error);
      setToast({ type: 'error', message: 'No se pudo crear la campaña VIP.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (campaign: VipCampaign, nextActive: boolean) => {
    setTogglingId(campaign.id);
    setToast(null);

    try {
      await toggleCampaignStatus(campaign.id, nextActive);
      setCampaigns((prev) =>
        prev.map((item) => (item.id === campaign.id ? { ...item, active: nextActive } : item)),
      );
      setToast({ type: 'success', message: nextActive ? 'Campaña activada.' : 'Campaña desactivada.' });
    } catch (error) {
      console.error('[Campaigns] Toggle failed:', error);
      setToast({ type: 'error', message: 'No se pudo actualizar la campaña.' });
    } finally {
      setTogglingId('');
    }
  };

  const copyQrValue = async (campaign: VipCampaign) => {
    try {
      await navigator.clipboard.writeText(qrValueForCampaign(campaign));
      setToast({ type: 'success', message: 'Deep link del QR copiado.' });
    } catch (error) {
      console.error('[Campaigns] Clipboard failed:', error);
      setToast({ type: 'error', message: 'No se pudo copiar el deep link.' });
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">
            Campañas VIP / QR Generator
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Campañas de Tier VIP</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Genera códigos QR reales para regalar tier Influencer o Business por{' '}
            <strong>365 días</strong>. Cada campaña vive en{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">vip_campaigns</code>.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800"
        >
          Crear Nueva Campaña
        </button>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Campañas creadas</h2>
          <button
            type="button"
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => void refreshCampaigns()}
          >
            Refrescar
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">Cargando campañas...</div>
        ) : campaigns.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            No hay campañas todavía. Crea la primera para generar su QR.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Campaña</th>
                  <th className="px-6 py-4 font-semibold">Código</th>
                  <th className="px-6 py-4 font-semibold">Tier</th>
                  <th className="px-6 py-4 font-semibold">Duración</th>
                  <th className="px-6 py-4 font-semibold">Usos</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">QR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{campaign.name}</div>
                      <div className="text-xs text-slate-500">{formatDate(campaign.createdAt)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-mono font-semibold text-slate-800">
                        {campaign.refCode}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold capitalize text-amber-900">
                        {campaign.grantedTier}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{campaign.durationDays} días</td>
                    <td className="px-6 py-4 text-slate-700">
                      <span className="font-semibold text-slate-950">{campaign.currentUses}</span>
                      <span className="text-slate-400"> / </span>
                      <span>{campaign.maxUses}</span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={campaign.active}
                        disabled={togglingId === campaign.id}
                        className={[
                          'relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50',
                          campaign.active ? 'bg-emerald-500' : 'bg-slate-300',
                        ].join(' ')}
                        onClick={() => void handleToggle(campaign, !campaign.active)}
                      >
                        <span
                          className={[
                            'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition',
                            campaign.active ? 'left-7' : 'left-1',
                          ].join(' ')}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        onClick={() => setQrModalCampaign(campaign)}
                      >
                        Ver QR
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <form
            className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
            onSubmit={handleCreate}
          >
            <h2 className="text-xl font-semibold text-slate-950">Nueva campaña VIP</h2>
            <p className="mt-1 text-sm text-slate-500">
              Crea un código con tier completo por 365 días y cupo controlado.
            </p>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-slate-700">Nombre de la campaña</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="Ej. Influencers Austin 2026"
                required
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Tier a regalar</span>
              <select
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                value={formTierKey}
                onChange={(event) => setFormTierKey(event.target.value as VipGrantedTier)}
              >
                {TIER_OPTIONS.map((option) => (
                  <option key={option.grantedTier} value={option.grantedTier}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">Duración fija: 365 días.</span>
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Cupo máximo de personas</span>
              <input
                type="number"
                min={1}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                value={formMaxUses}
                onChange={(event) => setFormMaxUses(Number.parseInt(event.target.value, 10) || 1)}
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? 'Creando...' : 'Crear campaña'}
              </button>
            </div>
          </form>
        </div>
      )}

      {qrModalCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-600">QR VIP</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{qrModalCampaign.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Regala tier <strong className="capitalize">{qrModalCampaign.grantedTier}</strong> por{' '}
              {qrModalCampaign.durationDays} días.
            </p>

            <div className="mx-auto mt-6 inline-flex rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <QRCodeSVG value={qrValueForCampaign(qrModalCampaign)} size={260} level="H" includeMargin />
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-3">
              <code className="break-all text-xs text-slate-700">{qrValueForCampaign(qrModalCampaign)}</code>
            </div>

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setQrModalCampaign(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={() => void copyQrValue(qrModalCampaign)}
              >
                Copiar link
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={[
            'fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border px-5 py-4 text-sm font-medium shadow-2xl',
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-800',
          ].join(' ')}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
