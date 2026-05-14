import { type FormEvent, useEffect, useState } from 'react';
import {
  DEFAULT_MARKET_RADAR_CONFIG,
  type MarketRadarConfig,
  getMarketRadarAuditLogs,
  getMarketRadarConfig,
  updateMarketRadarConfig,
  type MarketRadarAuditRow,
} from '../services/marketRadarAdminService';
import { useAuth } from '../auth/useAuth';

export default function MarketRadarProSettings() {
  const { user } = useAuth();
  const [config, setConfig] = useState<MarketRadarConfig>(DEFAULT_MARKET_RADAR_CONFIG);
  const [audit, setAudit] = useState<MarketRadarAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [c, logs] = await Promise.all([getMarketRadarConfig(), getMarketRadarAuditLogs()]);
        if (alive) {
          setConfig(c);
          setAudit(logs);
        }
      } catch {
        if (alive) {
          setToast({ type: 'err', message: 'No se pudo cargar la configuración de Market Radar.' });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    try {
      await updateMarketRadarConfig(config, user?.email || 'unknown-admin');
      setAudit(await getMarketRadarAuditLogs());
      setToast({ type: 'ok', message: 'Precio Pro de Market Radar publicado en system_config/market_radar.' });
    } catch {
      setToast({ type: 'err', message: 'Error al guardar.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">Market Radar</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Precio Pro (único)</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Independiente de los Tiers generales. Documento Firestore:{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">system_config/market_radar</code>. El servidor de
          Studio (<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">mint-market-radar</code>) exige al menos
          una business card y activación Pro vía{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">marketRadarProActive</code> o{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">marketRadarProExpiresAt</code> en{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">users/&#123;uid&#125;</code> (o rol{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">super_admin</code>).
        </p>
      </section>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-12 text-center text-slate-500">Cargando…</div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Precio Market Radar Pro (USD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="mt-2 w-full max-w-md rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
              value={config.proPriceUsd}
              onChange={(ev) => setConfig((prev) => ({ ...prev, proPriceUsd: Number.parseFloat(ev.target.value) || 0 }))}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-800">Equivalente Market Radar Pro (CS)</span>
            <input
              type="number"
              min={0}
              step="1"
              className="mt-2 w-full max-w-md rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
              value={config.proEquivalentCs}
              onChange={(ev) =>
                setConfig((prev) => ({ ...prev, proEquivalentCs: Number.parseInt(ev.target.value, 10) || 0 }))
              }
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar y publicar'}
          </button>
        </form>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Últimos cambios</h2>
        {audit.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Sin historial aún.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {audit.map((row) => (
              <li key={row.id} className="flex justify-between gap-4 py-3">
                <span className="text-slate-600">
                  ${row.proPriceUsd.toFixed(2)} USD · {row.proEquivalentCs.toLocaleString()} CS · {row.updatedBy}
                </span>
                <span className="text-slate-400">{row.timestamp ? row.timestamp.toLocaleString('es') : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast ? (
        <div
          className={[
            'fixed bottom-6 right-6 z-50 max-w-md rounded-2xl border px-5 py-4 text-sm font-medium shadow-2xl',
            toast.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800',
          ].join(' ')}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
