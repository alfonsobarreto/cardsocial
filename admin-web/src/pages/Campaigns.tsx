import { type FormEvent, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../auth/useAuth';
import {
  type VipCampaign,
  type VipCampaignType,
  type VipGrantedTier,
  createCampaign,
  getCampaigns,
  toggleCampaignStatus,
} from '../services/campaignsService';
import { type QRGift, createQRGift, getQRGifts } from '../services/qrGiftService';

type Toast = { type: 'success' | 'error'; message: string };
type CampaignTab = 'tiers' | 'coins';
type QrModal = { title: string; subtitle: string; value: string } | null;

const TIER_OPTIONS: { label: string; type: VipCampaignType; grantedTier: VipGrantedTier }[] = [
  { label: 'Influencer (365 días)', type: 'Influencer', grantedTier: 'influencer' },
  { label: 'Business / Negocio (365 días)', type: 'Business', grantedTier: 'business' },
];

function campaignQrValue(campaign: VipCampaign) {
  return `cardsocial://redeem?campaignCode=${encodeURIComponent(campaign.refCode)}`;
}

function giftQrValue(gift: QRGift) {
  return gift.qrCode || `cardsocial://redeem?code=${encodeURIComponent(gift.id)}`;
}

function formatDate(value?: Date | { toDate?: () => Date; seconds?: number } | null) {
  if (!value) return 'Pendiente';
  const date =
    value instanceof Date
      ? value
      : typeof value.toDate === 'function'
        ? value.toDate()
        : typeof value.seconds === 'number'
          ? new Date(value.seconds * 1000)
          : null;
  if (!date) return 'Pendiente';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function giftStatusStyles(status: QRGift['status']) {
  if (status === 'depleted') return 'bg-slate-100 text-slate-700';
  if (status === 'expired') return 'bg-red-100 text-red-700';
  return 'bg-emerald-100 text-emerald-700';
}

export default function Campaigns() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<CampaignTab>('tiers');
  const [campaigns, setCampaigns] = useState<VipCampaign[]>([]);
  const [gifts, setGifts] = useState<QRGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [qrModal, setQrModal] = useState<QrModal>(null);
  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [coinModalOpen, setCoinModalOpen] = useState(false);

  const [tierName, setTierName] = useState('');
  const [tierKey, setTierKey] = useState<VipGrantedTier>('influencer');
  const [tierMaxUses, setTierMaxUses] = useState(50);

  const [creditsPerUse, setCreditsPerUse] = useState(500);
  const [monthsPerUse, setMonthsPerUse] = useState(1);
  const [giftMaxUses, setGiftMaxUses] = useState(50);
  const [expiresInDays, setExpiresInDays] = useState(30);

  const selectedTier = TIER_OPTIONS.find((option) => option.grantedTier === tierKey) ?? TIER_OPTIONS[0];

  async function refreshAll() {
    try {
      setLoading(true);
      const [campaignList, giftList] = await Promise.all([getCampaigns(), getQRGifts()]);
      setCampaigns(campaignList);
      setGifts(giftList);
    } catch (error) {
      console.error('[Campaigns] Failed to load:', error);
      setToast({ type: 'error', message: 'No se pudieron cargar las campañas y regalos.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [campaignList, giftList] = await Promise.all([getCampaigns(), getQRGifts()]);
        if (isMounted) {
          setCampaigns(campaignList);
          setGifts(giftList);
        }
      } catch (error) {
        console.error('[Campaigns] Failed to load:', error);
        if (isMounted) {
          setToast({ type: 'error', message: 'No se pudieron cargar las campañas y regalos.' });
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

  const openTierModal = () => {
    setTierName('');
    setTierKey('influencer');
    setTierMaxUses(50);
    setTierModalOpen(true);
  };

  const openCoinModal = () => {
    setCreditsPerUse(500);
    setMonthsPerUse(1);
    setGiftMaxUses(50);
    setExpiresInDays(30);
    setCoinModalOpen(true);
  };

  const handleCreateTierCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = tierName.trim();

    if (!name) {
      setToast({ type: 'error', message: 'El nombre de la campaña es obligatorio.' });
      return;
    }

    setSubmitting(true);
    setToast(null);

    try {
      await createCampaign({
        name,
        type: selectedTier.type,
        grantedTier: selectedTier.grantedTier,
        maxUses: tierMaxUses,
      });
      await refreshAll();
      setTierModalOpen(false);
      setToast({ type: 'success', message: 'Campaña de tier creada con QR visual.' });
    } catch (error) {
      console.error('[Campaigns] Create tier failed:', error);
      setToast({ type: 'error', message: 'No se pudo crear la campaña de tier.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCoinGift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      setToast({ type: 'error', message: 'Sesión no disponible. Vuelve a iniciar sesión.' });
      return;
    }

    setSubmitting(true);
    setToast(null);

    try {
      await createQRGift({
        createdBy: user.uid,
        createdByEmail: user.email,
        creditsPerUse,
        monthsPerUse,
        maxUses: giftMaxUses,
        expiresInDays,
      });
      await refreshAll();
      setCoinModalOpen(false);
      setToast({
        type: 'success',
        message: 'Regalo de CS Coins creado sin descontar saldo del SuperAdmin.',
      });
    } catch (error) {
      console.error('[Campaigns] Create coin gift failed:', error);
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo crear el regalo de CS Coins.',
      });
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

  const copyQrValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast({ type: 'success', message: 'Deep link del QR copiado.' });
    } catch (error) {
      console.error('[Campaigns] Clipboard failed:', error);
      setToast({ type: 'error', message: 'No se pudo copiar el deep link.' });
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">
          Campañas VIP / QR Generator
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Centro de QRs promocionales</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Dos flujos conviven aquí: campañas que regalan tiers completos y regalos que entregan CS
          Coins/premium sin descontar saldo del SuperAdmin.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          {[
            ['tiers', 'Campañas de Tiers', 'Influencer/Business por 365 días'],
            ['coins', 'Regalos de CS Coins', 'Monedas + meses premium'],
          ].map(([key, label, description]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as CampaignTab)}
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

      {activeTab === 'tiers' ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Campañas de Tiers</h2>
              <p className="mt-1 text-xs text-slate-500">Colección: vip_campaigns</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void refreshAll()}
              >
                Refrescar
              </button>
              <button
                type="button"
                className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                onClick={openTierModal}
              >
                Crear Campaña
              </button>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">Cargando campañas...</div>
          ) : campaigns.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">No hay campañas todavía.</div>
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
                        <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">
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
                            'relative h-8 w-14 rounded-full transition disabled:opacity-50',
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
                          onClick={() =>
                            setQrModal({
                              title: campaign.name,
                              subtitle: `Regala tier ${campaign.grantedTier} por ${campaign.durationDays} días.`,
                              value: campaignQrValue(campaign),
                            })
                          }
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
      ) : (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Regalos de CS Coins</h2>
              <p className="mt-1 text-xs text-slate-500">Colección: qr_gifts · sin descuento al SuperAdmin</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void refreshAll()}
              >
                Refrescar
              </button>
              <button
                type="button"
                className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                onClick={openCoinModal}
              >
                Crear Regalo
              </button>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">Cargando regalos...</div>
          ) : gifts.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">No hay regalos de coins todavía.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Código</th>
                    <th className="px-6 py-4 font-semibold">Beneficio</th>
                    <th className="px-6 py-4 font-semibold">Usos</th>
                    <th className="px-6 py-4 font-semibold">Expira</th>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                    <th className="px-6 py-4 font-semibold">QR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gifts.map((gift) => (
                    <tr key={gift.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <code className="block max-w-[220px] truncate rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">
                          {gift.id}
                        </code>
                        <div className="mt-1 text-xs text-slate-500">{formatDate(gift.createdAt)}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        <div className="font-semibold text-slate-950">
                          {gift.creditsPerUse.toLocaleString()} CS Coins
                        </div>
                        <div className="text-xs text-slate-500">{gift.monthsPerUse} meses premium</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        <span className="font-semibold text-slate-950">{gift.usageCount}</span>
                        <span className="text-slate-400"> / </span>
                        <span>{gift.maxUses}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{formatDate(gift.expiresAt)}</td>
                      <td className="px-6 py-4">
                        <span
                          className={[
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
                            giftStatusStyles(gift.status),
                          ].join(' ')}
                        >
                          {gift.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                          onClick={() =>
                            setQrModal({
                              title: gift.id,
                              subtitle: `${gift.creditsPerUse.toLocaleString()} CS Coins + ${gift.monthsPerUse} meses premium.`,
                              value: giftQrValue(gift),
                            })
                          }
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
      )}

      {tierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <form className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onSubmit={handleCreateTierCampaign}>
            <h2 className="text-xl font-semibold text-slate-950">Nueva campaña de tier</h2>
            <p className="mt-1 text-sm text-slate-500">Regala Influencer o Business por 365 días.</p>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-slate-700">Nombre de la campaña</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                value={tierName}
                onChange={(event) => setTierName(event.target.value)}
                placeholder="Ej. Influencers Austin 2026"
                required
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Tier a regalar</span>
              <select
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                value={tierKey}
                onChange={(event) => setTierKey(event.target.value as VipGrantedTier)}
              >
                {TIER_OPTIONS.map((option) => (
                  <option key={option.grantedTier} value={option.grantedTier}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Cupo máximo de personas</span>
              <input
                type="number"
                min={1}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                value={tierMaxUses}
                onChange={(event) => setTierMaxUses(Number.parseInt(event.target.value, 10) || 1)}
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setTierModalOpen(false)}
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

      {coinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <form className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onSubmit={handleCreateCoinGift}>
            <h2 className="text-xl font-semibold text-slate-950">Nuevo regalo de CS Coins</h2>
            <p className="mt-1 text-sm text-slate-500">
              Genera un QR en <code className="text-xs">qr_gifts</code> sin descontar saldo del SuperAdmin.
            </p>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-slate-700">CS Coins por usuario</span>
              <input
                type="number"
                min={0}
                step={50}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                value={creditsPerUse}
                onChange={(event) => setCreditsPerUse(Number.parseInt(event.target.value, 10) || 0)}
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Meses premium por usuario</span>
              <input
                type="number"
                min={0}
                max={3}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                value={monthsPerUse}
                onChange={(event) => setMonthsPerUse(Number.parseInt(event.target.value, 10) || 0)}
              />
              <span className="mt-1 block text-xs text-slate-500">Máximo 3 meses por canje.</span>
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Cupo máximo</span>
              <input
                type="number"
                min={1}
                max={500}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                value={giftMaxUses}
                onChange={(event) => setGiftMaxUses(Number.parseInt(event.target.value, 10) || 1)}
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Expira en días</span>
              <input
                type="number"
                min={0}
                max={90}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(Number.parseInt(event.target.value, 10) || 0)}
              />
              <span className="mt-1 block text-xs text-slate-500">Usa 0 para no poner expiración.</span>
            </label>

            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="font-semibold">Pase maestro aplicado</div>
              <div className="mt-1">creditsDeducted = 0 · noBalanceDeduction = true</div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setCoinModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? 'Generando...' : 'Crear regalo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-600">QR listo</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{qrModal.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{qrModal.subtitle}</p>

            <div className="mx-auto mt-6 inline-flex rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <QRCodeSVG value={qrModal.value} size={260} level="H" includeMargin />
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-3">
              <code className="break-all text-xs text-slate-700">{qrModal.value}</code>
            </div>

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setQrModal(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={() => void copyQrValue(qrModal.value)}
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
