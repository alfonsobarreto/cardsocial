import type { User } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';

import {
  fetchBudgetSummary,
  putBudgetSettings,
  type BudgetSummaryResponse,
  type TrafficLightStatus,
} from '../services/budgetService';

function lightStyles(status: TrafficLightStatus) {
  if (status === 'green') {
    return {
      ring: 'ring-emerald-400/80',
      bg: 'bg-emerald-50',
      dot: 'bg-emerald-500',
      label: 'VERDE — puede planificarse retención de pago',
    };
  }
  if (status === 'yellow') {
    return {
      ring: 'ring-amber-400/80',
      bg: 'bg-amber-50',
      dot: 'bg-amber-500',
      label: 'AMARILLO — cautela',
    };
  }
  return {
    ring: 'ring-red-400/80',
    bg: 'bg-red-50',
    dot: 'bg-red-500',
    label: 'ROJO — no invertir en Push/SMS todavía',
  };
}

export default function DashboardBudgetTrafficLight({ user }: { user: User }) {
  const [data, setData] = useState<BudgetSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pctDraft, setPctDraft] = useState('8');
  const [revenueDraft, setRevenueDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const d = await fetchBudgetSummary(user);
      setData(d);
      setPctDraft(String(d.retentionBudgetPercent));
      setRevenueDraft(d.monthlyNetRevenueUsd != null ? String(d.monthlyNetRevenueUsd) : '');
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const status: TrafficLightStatus = data?.trafficLight.status ?? 'red';
  const ls = lightStyles(status);
  const channelsOn = Boolean(data?.channelsUnlocked);

  async function handleSaveSettings() {
    const pct = Number.parseFloat(pctDraft.replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError('% de budget debe estar entre 0 y 100.');
      return;
    }
    let revenueVal: number | null = null;
    const revTrim = revenueDraft.trim();
    if (revTrim !== '') {
      const r = Number.parseFloat(revTrim.replace(',', '.'));
      if (!Number.isFinite(r) || r < 0) {
        setError('Revenue mensual debe ser un número ≥ 0 o vacío.');
        return;
      }
      revenueVal = r;
    }

    try {
      setSaving(true);
      setError(null);
      setSaveOk(null);
      await putBudgetSettings(user, {
        retentionBudgetPercent: pct,
        reportedMonthlyNetRevenueUsd: revenueVal,
      });
      setSaveOk('Guardado. Entrada auditada en servidor (sin coste de terceros).');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className={`rounded-3xl border border-slate-200 p-6 shadow-sm ring-2 ring-inset ${ls.ring} ${ls.bg}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
            Semáforo financiero · retención
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">¿Tiene sentido invertir en Push/SMS?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
            Herramienta interna: MAU desde Mongo; ingreso neto puede ser <strong>declarado por ti</strong>, leído desde
            variables de entorno del API, o —si el backend tiene{' '}
            <code className="rounded bg-slate-100 px-1">STRIPE_SECRET_KEY</code> /{' '}
            <code className="rounded bg-slate-100 px-1">REVENUECAT_*</code>
            — agregado automático con reglas conservadoras. Los botones de canal siguen siendo stubs; solo se habilitan
            en VERDE como señal de gobierno.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
          <span className={`inline-flex h-4 w-4 shrink-0 rounded-full ${ls.dot}`} aria-hidden />
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">Estado</p>
            <p className="text-sm font-semibold text-slate-900">{ls.label}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-slate-600">Cargando métricas…</p>
      ) : error ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      ) : data ? (
        <>
          <p className="mt-5 text-sm leading-6 text-slate-800">{data.trafficLight.messageEs}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">MAU (30 d, Mongo)</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
                {data.monthlyActiveUsers.toLocaleString('es-ES')}
              </p>
              <p className="mt-1 text-xs text-slate-500">Heurística documentada en disclaimers.</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">Revenue neto mensual (USD)</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
                {data.monthlyNetRevenueUsd != null
                  ? `$${data.monthlyNetRevenueUsd.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">Fuente: {data.revenueSource}</p>
              {data.revenueBreakdown ? (
                <dl className="mt-2 space-y-0.5 text-[11px] leading-4 text-slate-600">
                  <div className="flex justify-between gap-2">
                    <dt>Stripe (mes UTC)</dt>
                    <dd className="tabular-nums">
                      {data.revenueBreakdown.stripeUsd != null
                        ? `$${data.revenueBreakdown.stripeUsd.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
                        : data.revenueBreakdown.stripeError
                          ? `error (${data.revenueBreakdown.stripeError})`
                          : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>RevenueCat</dt>
                    <dd className="tabular-nums">
                      {data.revenueBreakdown.revenueCatUsd != null
                        ? `$${data.revenueBreakdown.revenueCatUsd.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
                        : data.revenueBreakdown.revenueCatError
                          ? `error (${data.revenueBreakdown.revenueCatError})`
                          : '—'}
                    </dd>
                  </div>
                  {data.revenueBreakdown.revenueCatMetricId ? (
                    <p className="text-slate-500">
                      Métrica RC: {data.revenueBreakdown.revenueCatMetricId}
                      {data.revenueBreakdown.revenueCatPeriodNote
                        ? ` · ${data.revenueBreakdown.revenueCatPeriodNote}`
                        : ''}
                    </p>
                  ) : null}
                  {data.revenueBreakdown.conservativeBlocked ? (
                    <p className="text-amber-800">Agregación automática bloqueada (conservador).</p>
                  ) : null}
                </dl>
              ) : null}
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">Budget retención ({data.retentionBudgetPercent}%)</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
                {data.retentionBudgetUsd != null
                  ? `$${data.retentionBudgetUsd.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">Techo orientativo, no un gasto automático.</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">Umbrales activos</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                <li>Rojo si MAU &lt; {data.thresholds.redUsersBelow} o revenue &lt; ${data.thresholds.redRevenueBelow}</li>
                <li>
                  Verde si MAU ≥ {data.thresholds.greenUsersMin} y revenue ≥ ${data.thresholds.greenRevenueMin}
                </li>
              </ul>
            </article>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Parámetros (auditados en Mongo)</p>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">% budget retención (0–100)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                  value={pctDraft}
                  onChange={(e) => setPctDraft(e.target.value)}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Revenue mensual neto USD (declarado)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="ej. 450 o vacío para usar solo env"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                  value={revenueDraft}
                  onChange={(e) => setRevenueDraft(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveSettings()}
                className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            {saveOk ? <p className="mt-3 text-xs text-emerald-800">{saveOk}</p> : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!channelsOn}
              title={channelsOn ? undefined : 'Solo disponible con semáforo VERDE'}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Configurar Push (stub)
            </button>
            <button
              type="button"
              disabled={!channelsOn}
              title={channelsOn ? undefined : 'Solo disponible con semáforo VERDE'}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Configurar SMS (stub)
            </button>
          </div>
          {!channelsOn ? (
            <p className="mt-2 text-xs text-slate-600">
              Botones deshabilitados: no hay proveedores conectados y el semáforo no está verde — evita gasto no
              autorizado.
            </p>
          ) : (
            <p className="mt-2 text-xs text-amber-900">
              Semáforo verde: antes de contratar Twilio/FCM, valida con finance que el % de retención y el revenue
              declarado siguen siendo ciertos.
            </p>
          )}

          <details className="mt-5 rounded-xl border border-slate-200 bg-white/60 p-3 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-800">Disclaimers / auditoría</summary>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {data.disclaimers.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            {data.channelActivationHistory.length ? (
              <p className="mt-2 font-medium text-slate-700">
                Histórico canal (reservado): {data.channelActivationHistory.length} evento(s).
              </p>
            ) : (
              <p className="mt-2 text-slate-500">Histórico de activaciones: vacío en v1.</p>
            )}
          </details>
        </>
      ) : null}
    </section>
  );
}
