import { type FormEvent, useEffect, useState } from 'react';
import {
  type CommerceAdminConfig,
  type CommerceCreditPackRow,
  getCommerceAdminConfig,
  updateCommerceAdminConfig,
} from '../services/commerceAdminService';
import { useAuth } from '../auth/useAuth';

function emptyRow(): CommerceCreditPackRow {
  return { id: `pack_${Date.now()}`, productId: '', priceUsd: 0, equivalentCs: 0, popular: false };
}

export default function RulesCommerce() {
  const { user } = useAuth();
  const [config, setConfig] = useState<CommerceAdminConfig>({ creditPacks: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const c = await getCommerceAdminConfig();
        if (alive) setConfig(c);
      } catch {
        if (alive) setToast({ type: 'err', message: 'No se pudo cargar system_config/commerce.' });
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
      await updateCommerceAdminConfig(config, user?.email || 'unknown-admin');
      setToast({ type: 'ok', message: 'Catálogo publicado en system_config/commerce.' });
    } catch {
      setToast({ type: 'err', message: 'Error al guardar.' });
    } finally {
      setSaving(false);
    }
  };

  const updatePack = (index: number, patch: Partial<CommerceCreditPackRow>) => {
    setConfig((prev) => {
      const creditPacks = prev.creditPacks.map((p, i) => (i === index ? { ...p, ...patch } : p));
      return { creditPacks };
    });
  };

  const removePack = (index: number) => {
    setConfig((prev) => ({
      creditPacks: prev.creditPacks.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">Commerce</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Monedas CS — packs</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Documento{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">system_config/commerce</code>. La app móvil solo
          muestra precios publicados aquí. Cada fila necesita <code className="text-xs">productId</code> alineado con
          RevenueCat.
        </p>
      </section>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-12 text-center text-slate-500">Cargando…</div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-800">{config.creditPacks.length} pack(s)</p>
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              onClick={() => setConfig((prev) => ({ creditPacks: [...prev.creditPacks, emptyRow()] }))}
            >
              Añadir pack
            </button>
          </div>

          {config.creditPacks.length === 0 ? (
            <p className="text-sm text-slate-500">Sin packs. Pulsa «Añadir pack» o guarda para publicar un catálogo vacío.</p>
          ) : (
            <div className="space-y-4">
              {config.creditPacks.map((row, index) => (
                <div
                  key={`${row.id}-${index}`}
                  className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-12 md:items-end"
                >
                  <label className="md:col-span-2">
                    <span className="text-xs font-semibold text-slate-600">id</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={row.id}
                      onChange={(ev) => updatePack(index, { id: ev.target.value })}
                    />
                  </label>
                  <label className="md:col-span-4">
                    <span className="text-xs font-semibold text-slate-600">productId (RevenueCat)</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={row.productId}
                      onChange={(ev) => updatePack(index, { productId: ev.target.value })}
                    />
                  </label>
                  <label className="md:col-span-2">
                    <span className="text-xs font-semibold text-slate-600">Monto USD</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={row.priceUsd || ''}
                      onChange={(ev) => updatePack(index, { priceUsd: Number.parseFloat(ev.target.value) || 0 })}
                    />
                  </label>
                  <label className="md:col-span-2">
                    <span className="text-xs font-semibold text-slate-600">Equivalente CS</span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={row.equivalentCs || ''}
                      onChange={(ev) => updatePack(index, { equivalentCs: Number.parseInt(ev.target.value, 10) || 0 })}
                    />
                  </label>
                  <label className="flex items-center gap-2 md:col-span-1">
                    <input
                      type="checkbox"
                      checked={Boolean(row.popular)}
                      onChange={(ev) => updatePack(index, { popular: ev.target.checked })}
                    />
                    <span className="text-xs font-semibold text-slate-600">Popular</span>
                  </label>
                  <div className="md:col-span-1 flex md:justify-end">
                    <button
                      type="button"
                      className="text-sm font-semibold text-red-600 hover:underline"
                      onClick={() => removePack(index)}
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

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
