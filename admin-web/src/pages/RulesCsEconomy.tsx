import { type FormEvent, useEffect, useState } from 'react';
import {
  DEFAULT_CS_ECONOMY_ADMIN,
  type CsEconomyAdminConfig,
  getCsEconomyAdminConfig,
  updateCsEconomyAdminConfig,
} from '../services/csEconomyAdminService';
import { useAuth } from '../auth/useAuth';

const TX_ID = 'texas_longhorns';

export default function RulesCsEconomy() {
  const { user } = useAuth();
  const [config, setConfig] = useState<CsEconomyAdminConfig>(DEFAULT_CS_ECONOMY_ADMIN);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const c = await getCsEconomyAdminConfig();
        if (alive) setConfig(c);
      } catch {
        if (alive) setToast({ type: 'err', message: 'No se pudo cargar system_config/cs_economy.' });
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
      await updateCsEconomyAdminConfig(config, user?.email || 'unknown-admin');
      setToast({ type: 'ok', message: 'Economía CS publicada en system_config/cs_economy.' });
    } catch {
      setToast({ type: 'err', message: 'Error al guardar.' });
    } finally {
      setSaving(false);
    }
  };

  const txRow = config.themeBundles[TX_ID] ?? { priceUsd: 0, creditsCs: 0 };

  const setTx = (patch: Partial<{ priceUsd: number; creditsCs: number }>) => {
    setConfig((prev) => ({
      ...prev,
      themeBundles: {
        ...prev.themeBundles,
        [TX_ID]: { ...txRow, ...patch },
      },
    }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">CS Economy</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Bonos y precios CS (dos casilleros)</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Documento <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">system_config/cs_economy</code>. Bonos
          (bienvenida, pack estudiantil, cashback tarjeta negocio), precio de icono Studio, y bundle temático Texas
          Longhorns. Par USD + CS donde aplique — la app aplica el monto en CS publicado.
        </p>
      </section>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-12 text-center text-slate-500">Cargando…</div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="col-span-full text-lg font-semibold text-slate-900">Bono bienvenida (pago confirmado)</legend>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Monto ref. USD</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={config.welcomeBonusUsd}
                onChange={(ev) =>
                  setConfig((p) => ({ ...p, welcomeBonusUsd: Number.parseFloat(ev.target.value) || 0 }))
                }
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Créditos CS a otorgar</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={config.welcomeBonusCs}
                onChange={(ev) =>
                  setConfig((p) => ({ ...p, welcomeBonusCs: Number.parseInt(ev.target.value, 10) || 0 }))
                }
              />
            </label>
          </fieldset>

          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="col-span-full text-lg font-semibold text-slate-900">Pack estudiantil (.edu + social)</legend>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Monto ref. USD</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={config.studentPackUsd}
                onChange={(ev) =>
                  setConfig((p) => ({ ...p, studentPackUsd: Number.parseFloat(ev.target.value) || 0 }))
                }
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Créditos CS</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={config.studentPackBonusCs}
                onChange={(ev) =>
                  setConfig((p) => ({ ...p, studentPackBonusCs: Number.parseInt(ev.target.value, 10) || 0 }))
                }
              />
            </label>
          </fieldset>

          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="col-span-full text-lg font-semibold text-slate-900">Cashback licencia tarjeta negocio</legend>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Monto ref. USD</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={config.businessCardCashbackUsd}
                onChange={(ev) =>
                  setConfig((p) => ({
                    ...p,
                    businessCardCashbackUsd: Number.parseFloat(ev.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Créditos CS</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={config.businessCardCashbackCs}
                onChange={(ev) =>
                  setConfig((p) => ({
                    ...p,
                    businessCardCashbackCs: Number.parseInt(ev.target.value, 10) || 0,
                  }))
                }
              />
            </label>
          </fieldset>

          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="col-span-full text-lg font-semibold text-slate-900">Icono vectorial Studio (cuando está de pago)</legend>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Monto ref. USD</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={config.studioIconUsd}
                onChange={(ev) =>
                  setConfig((p) => ({ ...p, studioIconUsd: Number.parseFloat(ev.target.value) || 0 }))
                }
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Precio en CS</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={config.studioIconCreditCs}
                onChange={(ev) =>
                  setConfig((p) => ({
                    ...p,
                    studioIconCreditCs: Number.parseInt(ev.target.value, 10) || 0,
                  }))
                }
              />
            </label>
          </fieldset>

          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="col-span-full text-lg font-semibold text-slate-900">
              Bundle temático <code className="text-sm">{TX_ID}</code>
            </legend>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Monto ref. USD</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={txRow.priceUsd}
                onChange={(ev) => setTx({ priceUsd: Number.parseFloat(ev.target.value) || 0 })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Precio en CS</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={txRow.creditsCs}
                onChange={(ev) => setTx({ creditsCs: Number.parseInt(ev.target.value, 10) || 0 })}
              />
            </label>
          </fieldset>

          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow disabled:opacity-50"
          >
            {saving ? 'Publicando…' : 'Guardar y publicar'}
          </button>
        </form>
      )}

      {toast ? (
        <div
          className={[
            'fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border px-5 py-4 text-sm font-medium shadow-2xl',
            toast.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800',
          ].join(' ')}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
