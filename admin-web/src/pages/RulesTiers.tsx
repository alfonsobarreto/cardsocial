import { type FormEvent, useEffect, useState } from 'react';
import {
  DEFAULT_TIERS_CONFIG,
  type PricingAuditLog,
  type TierKey,
  type TiersConfig,
  getPricingAuditLogs,
  getTiersConfig,
  updateTiersConfig,
} from '../services/rulesService';
import { useAuth } from '../auth/useAuth';

const TIER_META: { key: TierKey; title: string; subtitle: string; accent: string }[] = [
  {
    key: 'free',
    title: 'Gratis',
    subtitle: 'Tier base para todos los usuarios nuevos.',
    accent: 'border-slate-200',
  },
  {
    key: 'influencer',
    title: 'Influencer',
    subtitle: 'Creadores y perfiles con alcance.',
    accent: 'border-amber-200',
  },
  {
    key: 'business',
    title: 'Negocio',
    subtitle: 'Equipos y presencia profesional.',
    accent: 'border-emerald-200',
  },
];

type Toast = { type: 'success' | 'error'; message: string };

export default function RulesTiers() {
  const { user } = useAuth();
  const [config, setConfig] = useState<TiersConfig>(DEFAULT_TIERS_CONFIG);
  const [auditLogs, setAuditLogs] = useState<PricingAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const adminEmail = user?.email || 'unknown-admin';

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [next, logs] = await Promise.all([getTiersConfig(), getPricingAuditLogs()]);
        if (isMounted) {
          setConfig(next);
          setAuditLogs(logs);
        }
      } catch (error) {
        console.error('[RulesTiers] Failed to load tiers config:', error);
        if (isMounted) {
          setToast({
            type: 'error',
            message: 'No se pudo cargar la configuracion. Revisa Firestore y reglas de seguridad.',
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toast || toast.type !== 'success') return;

    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const updateTier = (key: TierKey, patch: Partial<TiersConfig[TierKey]>) => {
    setConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  const updateAddOns = (patch: Partial<TiersConfig['addOns']>) => {
    setConfig((prev) => ({
      ...prev,
      addOns: { ...prev.addOns, ...patch },
    }));
  };

  async function refreshAuditLogs() {
    try {
      setAuditLogs(await getPricingAuditLogs());
    } catch (error) {
      console.error('[RulesTiers] Failed to load pricing audit logs:', error);
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setToast(null);

    try {
      await updateTiersConfig(config, adminEmail);
      await refreshAuditLogs();
      setToast({ type: 'success', message: 'Cambios guardados y publicados. La landing puede consumir `system_config/tiers`.' });
    } catch (error) {
      console.error('[RulesTiers] Failed to save tiers config:', error);
      setToast({ type: 'error', message: 'No se pudieron guardar los cambios.' });
    } finally {
      setSaving(false);
    }
  };

  function formatAuditDate(value: PricingAuditLog['timestamp']) {
    if (!value) return 'Pendiente';
    const date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate() : null;
    if (!date) return 'Pendiente';
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">Headless CMS</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Pricing &amp; Tiers CMS</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Este documento vive en Firestore: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">system_config/tiers</code>.
          La app movil, paywalls y landing publica pueden leer límites, precios y trials desde una sola fuente.
        </p>
      </section>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-16 text-center text-sm font-medium text-slate-500 shadow-sm">
          Cargando configuracion de tiers...
        </div>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-3">
            {TIER_META.map(({ key, title, subtitle, accent }) => {
              const tier = config[key];
              return (
                <article
                  key={key}
                  className={`flex flex-col rounded-3xl border-2 bg-white p-6 shadow-sm ${accent}`}
                >
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-xl font-semibold capitalize text-slate-950">{title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
                    <p className="mt-2 font-mono text-xs text-slate-400">tier: {key}</p>
                  </div>

                  <div className="mt-5 flex flex-1 flex-col gap-4">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">IconData max</span>
                      <input
                        type="number"
                        min={0}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                        value={tier.iconDataLimit}
                        onChange={(e) =>
                          updateTier(key, { iconDataLimit: Number.parseInt(e.target.value, 10) || 0 })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Smart Cards max</span>
                      <input
                        type="number"
                        min={0}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                        value={tier.smartCardsLimit}
                        onChange={(e) =>
                          updateTier(key, { smartCardsLimit: Number.parseInt(e.target.value, 10) || 0 })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Business Cards max</span>
                      <input
                        type="number"
                        min={0}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                        value={tier.businessCardsLimit}
                        onChange={(e) =>
                          updateTier(key, { businessCardsLimit: Number.parseInt(e.target.value, 10) || 0 })
                        }
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Precio mensual (USD)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                        value={tier.monthlyPriceUsd}
                        onChange={(e) =>
                          updateTier(key, { monthlyPriceUsd: Number.parseFloat(e.target.value) || 0 })
                        }
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Free Trial</span>
                      <select
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
                        value={tier.freeTrialDays}
                        onChange={(e) =>
                          updateTier(key, {
                            freeTrialDays: Number.parseInt(e.target.value, 10) as TiersConfig[TierKey]['freeTrialDays'],
                          })
                        }
                      >
                        <option value={0}>0 días</option>
                        <option value={14}>14 días</option>
                        <option value={30}>30 días</option>
                        <option value={90}>90 días</option>
                      </select>
                    </label>

                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">Premium themes</p>
                        <p className="text-xs text-slate-500">Visible en landing y politicas de producto</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={tier.premiumThemes}
                        className={[
                          'relative h-8 w-14 shrink-0 rounded-full transition',
                          tier.premiumThemes ? 'bg-amber-500' : 'bg-slate-300',
                        ].join(' ')}
                        onClick={() => updateTier(key, { premiumThemes: !tier.premiumThemes })}
                      >
                        <span
                          className={[
                            'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition',
                            tier.premiumThemes ? 'left-7' : 'left-1',
                          ].join(' ')}
                        />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600">
                Add-ons / Hardware
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">Ventas individuales</h2>
              <p className="mt-2 text-sm text-slate-500">
                Precios a-la-carte para upsells, hardware físico y tarjetas adicionales.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Single Business Card Extra (USD)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  value={config.addOns.singleBusinessCardExtraUsd}
                  onChange={(e) => updateAddOns({ singleBusinessCardExtraUsd: Number.parseFloat(e.target.value) || 0 })}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Tarjeta Física PVC (USD)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  value={config.addOns.physicalPvcCardUsd}
                  onChange={(e) => updateAddOns({ physicalPvcCardUsd: Number.parseFloat(e.target.value) || 0 })}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Tarjeta Física Metal (USD)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  value={config.addOns.physicalMetalCardUsd}
                  onChange={(e) => updateAddOns({ physicalMetalCardUsd: Number.parseFloat(e.target.value) || 0 })}
                />
              </label>
            </div>
          </section>

          <div className="sticky bottom-4 z-10 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Publicando...' : 'Guardar Cambios y Publicar'}
            </button>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-950">Historial de Pricing</h2>
          <p className="mt-1 text-sm text-slate-500">Últimos 10 cambios en pricing_audit_logs.</p>
        </div>

        {auditLogs.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-500">Todavía no hay cambios auditados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                  <th className="px-6 py-4 font-semibold">Admin</th>
                  <th className="px-6 py-4 font-semibold">Resumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-4 text-slate-700">{formatAuditDate(log.timestamp)}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{log.updatedBy}</td>
                    <td className="px-6 py-4 text-slate-600">
                      Precios actualizados · Influencer ${log.snapshot.influencer.monthlyPriceUsd}/mo · Business ${log.snapshot.business.monthlyPriceUsd}/mo
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
