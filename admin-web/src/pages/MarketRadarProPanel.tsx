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

/**
 * Bloque de Market Radar dentro de Rules & Tiers (misma pantalla que pricing de planes).
 */
export default function MarketRadarProPanel() {
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
      setToast({ type: 'ok', message: 'Configuración de Market Radar guardada correctamente.' });
    } catch {
      setToast({ type: 'err', message: 'Error al guardar.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">Market Radar</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-950">Precio Pro y prueba global</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          La app y el servidor Studio leen precio CS/USD y el interruptor de prueba global. Cuentas con rol de superadmin
          o la cuenta operativa <span className="font-medium text-slate-800">pochobs@gmail.com</span> tienen acceso
          ilimitado al radar sin comprar Pro.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-6 py-10 text-center text-slate-500">
          Cargando…
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
              checked={config.radarTrialEnabled}
              onChange={(ev) => setConfig((prev) => ({ ...prev, radarTrialEnabled: ev.target.checked }))}
            />
            <span>
              <span className="text-sm font-semibold text-slate-900">Prueba global de Market Radar</span>
              <span className="mt-1 block text-xs text-slate-600">
                Si está activa, se omiten en servidor las comprobaciones de Pro y tarjeta de negocio para todos los
                usuarios (útil en lanzamientos controlados).
              </span>
            </span>
          </label>

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
            {saving ? 'Guardando…' : 'Guardar Market Radar'}
          </button>
        </form>
      )}

      <div className="border-t border-slate-100 pt-6">
        <h3 className="text-base font-semibold text-slate-950">Últimos cambios (precio)</h3>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Sin historial aún.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {audit.map((row) => (
              <li key={row.id} className="flex justify-between gap-4 py-3">
                <span className="text-slate-600">
                  ${row.proPriceUsd.toFixed(2)} USD · {row.proEquivalentCs.toLocaleString()} CS · {row.updatedBy}
                </span>
                <span className="shrink-0 text-slate-400">
                  {row.timestamp ? row.timestamp.toLocaleString('es') : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

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
    </section>
  );
}
