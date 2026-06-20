import { type FormEvent, useEffect, useState } from 'react';
import {
  type CommerceAdminConfig,
  type CommerceCreditPackRow,
  type CommerceIconDataSlotPackRow,
  type CommerceVoipMinutePackRow,
  getCommerceAdminConfig,
  updateCommerceAdminConfig,
} from '../services/commerceAdminService';
import { useAuth } from '../auth/useAuth';
import { useAdminT } from '../i18n/useAdminT';
import { CsPricingRulesInline } from '../components/CsPricingRulesBanner';

function emptyCreditRow(): CommerceCreditPackRow {
  return { id: `pack_${Date.now()}`, productId: '', priceUsd: 0, equivalentCs: 0, popular: false };
}

function emptyVoipRow(): CommerceVoipMinutePackRow {
  return { id: `voip_${Date.now()}`, productId: '', priceUsd: 0, minutes: 0, popular: false };
}

function emptyIconRow(): CommerceIconDataSlotPackRow {
  return { id: `icon_${Date.now()}`, productId: '', priceUsd: 0, slots: 0, popular: false };
}

type PackGridProps<T extends { id: string; productId: string; priceUsd: number; popular?: boolean }> = {
  rows: T[];
  onUpdate: (index: number, patch: Partial<T>) => void;
  onRemove: (index: number) => void;
  extraField: {
    key: keyof T;
    label: string;
    parse: (value: string) => number;
  };
};

function PackGrid<T extends { id: string; productId: string; priceUsd: number; popular?: boolean }>({
  rows,
  onUpdate,
  onRemove,
  extraField,
}: PackGridProps<T>) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Sin packs en esta sección.</p>;
  }

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <div
          key={`${row.id}-${index}`}
          className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-12 md:items-end"
        >
          <label className="md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">id</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={row.id}
              onChange={(ev) => onUpdate(index, { id: ev.target.value } as Partial<T>)}
            />
          </label>
          <label className="md:col-span-4">
            <span className="text-xs font-semibold text-slate-600">productId (RevenueCat)</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={row.productId}
              onChange={(ev) => onUpdate(index, { productId: ev.target.value } as Partial<T>)}
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
              onChange={(ev) => onUpdate(index, { priceUsd: Number.parseFloat(ev.target.value) || 0 } as Partial<T>)}
            />
          </label>
          <label className="md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">{extraField.label}</span>
            <input
              type="number"
              min={0}
              step="1"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={Number(row[extraField.key]) || ''}
              onChange={(ev) =>
                onUpdate(index, { [extraField.key]: extraField.parse(ev.target.value) } as Partial<T>)
              }
            />
          </label>
          <label className="flex items-center gap-2 md:col-span-1">
            <input
              type="checkbox"
              checked={Boolean(row.popular)}
              onChange={(ev) => onUpdate(index, { popular: ev.target.checked } as Partial<T>)}
            />
            <span className="text-xs font-semibold text-slate-600">Popular</span>
          </label>
          <div className="flex md:col-span-1 md:justify-end">
            <button
              type="button"
              className="text-sm font-semibold text-red-600 hover:underline"
              onClick={() => onRemove(index)}
            >
              Borrar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RulesCommerce() {
  const { t } = useAdminT();
  const { user } = useAuth();
  const [config, setConfig] = useState<CommerceAdminConfig>({
    creditPacks: [],
    voipMinutePacks: [],
    iconDataSlotPacks: [],
  });
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
        if (alive) setToast({ type: 'err', message: t('admin_commerce_load_fail') });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    try {
      await updateCommerceAdminConfig(config, user?.email || 'unknown-admin');
      setToast({ type: 'ok', message: t('admin_commerce_save_ok') });
    } catch {
      setToast({ type: 'err', message: t('admin_commerce_save_fail') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">Commerce</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Complementos — catálogo app</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Publica en <code className="text-xs">system_config/commerce</code> los packs que la app muestra en contexto
          (no en Suscripciones). Cada fila válida necesita <code className="text-xs">productId</code> alineado con
          RevenueCat y precio USD &gt; 0. Las filas incompletas se omiten al guardar.
        </p>
      </section>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-12 text-center text-slate-500">Cargando…</div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-8">
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Monedas CS</h2>
                <p className="mt-1 text-sm text-slate-600">{config.creditPacks.length} pack(s) · pantalla /vault_store</p>
                <CsPricingRulesInline />
              </div>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => setConfig((prev) => ({ ...prev, creditPacks: [...prev.creditPacks, emptyCreditRow()] }))}
              >
                Añadir pack CS
              </button>
            </div>
            <PackGrid
              rows={config.creditPacks}
              onUpdate={(index, patch) =>
                setConfig((prev) => ({
                  ...prev,
                  creditPacks: prev.creditPacks.map((p, i) => (i === index ? { ...p, ...patch } : p)),
                }))
              }
              onRemove={(index) =>
                setConfig((prev) => ({
                  ...prev,
                  creditPacks: prev.creditPacks.filter((_, i) => i !== index),
                }))
              }
              extraField={{
                key: 'equivalentCs',
                label: 'Créditos entregados (no precio de pago)',
                parse: (v) => Number.parseInt(v, 10) || 0,
              }}
            />
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Minutos AirTime (VoIP)</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {config.voipMinutePacks.length} pack(s) · modal al tocar saldo o sin minutos en llamada
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() =>
                  setConfig((prev) => ({ ...prev, voipMinutePacks: [...prev.voipMinutePacks, emptyVoipRow()] }))
                }
              >
                Añadir pack VoIP
              </button>
            </div>
            <PackGrid
              rows={config.voipMinutePacks}
              onUpdate={(index, patch) =>
                setConfig((prev) => ({
                  ...prev,
                  voipMinutePacks: prev.voipMinutePacks.map((p, i) => (i === index ? { ...p, ...patch } : p)),
                }))
              }
              onRemove={(index) =>
                setConfig((prev) => ({
                  ...prev,
                  voipMinutePacks: prev.voipMinutePacks.filter((_, i) => i !== index),
                }))
              }
              extraField={{
                key: 'minutes',
                label: 'Minutos',
                parse: (v) => Number.parseInt(v, 10) || 0,
              }}
            />
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Cupos IconData (Bóveda)</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {config.iconDataSlotPacks.length} pack(s) · modal al alcanzar límite de Bóveda
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    iconDataSlotPacks: [...prev.iconDataSlotPacks, emptyIconRow()],
                  }))
                }
              >
                Añadir pack IconData
              </button>
            </div>
            <PackGrid
              rows={config.iconDataSlotPacks}
              onUpdate={(index, patch) =>
                setConfig((prev) => ({
                  ...prev,
                  iconDataSlotPacks: prev.iconDataSlotPacks.map((p, i) => (i === index ? { ...p, ...patch } : p)),
                }))
              }
              onRemove={(index) =>
                setConfig((prev) => ({
                  ...prev,
                  iconDataSlotPacks: prev.iconDataSlotPacks.filter((_, i) => i !== index),
                }))
              }
              extraField={{
                key: 'slots',
                label: 'Cupos extra',
                parse: (v) => Number.parseInt(v, 10) || 0,
              }}
            />
          </section>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow disabled:opacity-50"
            >
              {saving ? 'Publicando…' : 'Guardar y publicar todo el catálogo'}
            </button>
          </div>
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
