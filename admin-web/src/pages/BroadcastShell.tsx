import { useCallback, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { isSuperAdminUser } from '../auth/adminAuthGuard';
import { useAuth } from '../auth/useAuth';
import {
  BROADCAST_LANGS,
  BROADCAST_SEGMENT_OPTIONS,
  LANG_TAB_LABEL,
  type BroadcastMessagesPayload,
  RENEWAL_7_DRAFT,
  WELCOME_MESSAGE_DRAFT,
  broadcastPreview,
  broadcastSend,
  formatSimulationLine,
} from '../services/broadcastService';
import { useAdminT } from '../i18n/useAdminT';

const emptyMessages = (): BroadcastMessagesPayload =>
  Object.fromEntries(BROADCAST_LANGS.map((lang) => [lang, { subject: '', body: '' }])) as BroadcastMessagesPayload;

export default function BroadcastShell() {
  const { t } = useAdminT();
  const { user, loading: authLoading } = useAuth();
  const defaultSegment =
    BROADCAST_SEGMENT_OPTIONS.find((s) => s.value === 'new_users_week')?.value ??
    BROADCAST_SEGMENT_OPTIONS[0].value;
  const [segment, setSegment] = useState(defaultSegment);
  const [days, setDays] = useState(7);
  const [langTab, setLangTab] = useState<(typeof BROADCAST_LANGS)[number]>('es');
  const [channel, setChannel] = useState<'email' | 'push' | 'both'>('email');
  const [messages, setMessages] = useState<BroadcastMessagesPayload>(emptyMessages);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewWithEmail, setPreviewWithEmail] = useState<number | null>(null);
  const [histogram, setHistogram] = useState<Record<string, number> | null>(null);
  const [sample, setSample] = useState<{ uid: string; email: string | null; language: string }[] | null>(null);
  const [firestoreOn, setFirestoreOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTyped, setConfirmTyped] = useState('');

  const segmentMeta = useMemo(
    () => BROADCAST_SEGMENT_OPTIONS.find((s) => s.value === segment),
    [segment],
  );

  const quickOptions = useMemo(() => BROADCAST_SEGMENT_OPTIONS.filter((s) => s.group === 'quick'), []);
  const moreOptions = useMemo(() => BROADCAST_SEGMENT_OPTIONS.filter((s) => s.group === 'more'), []);

  const runPreview = useCallback(async () => {
    if (!user) return;
    setError(null);
    setSendResult(null);
    setBusy(true);
    try {
      const p = await broadcastPreview(user, {
        segment,
        ...(segment === 'new_users' ? { days } : {}),
      });
      setPreviewCount(p.count);
      setPreviewWithEmail(p.withEmail);
      setHistogram(p.languageHistogram);
      setSample(p.sample);
      setFirestoreOn(p.firestoreEnabled);
    } catch (e) {
      console.error('[BroadcastShell] runPreview', e);
      setPreviewCount(null);
      setPreviewWithEmail(null);
      setHistogram(null);
      setSample(null);
      setFirestoreOn(null);
      setError(t('admin_broadcast_err_general'));
    } finally {
      setBusy(false);
    }
  }, [days, segment, user, t]);

  const applyMondayWelcome = useCallback(async () => {
    if (!user) return;
    setSegment('new_users_week');
    setMessages((prev) => {
      const next = { ...prev };
      for (const lang of BROADCAST_LANGS) {
        next[lang] = { ...WELCOME_MESSAGE_DRAFT[lang] };
      }
      return next;
    });
    setError(null);
    setSendResult(null);
    setBusy(true);
    try {
      const p = await broadcastPreview(user, { segment: 'new_users_week' });
      setPreviewCount(p.count);
      setPreviewWithEmail(p.withEmail);
      setHistogram(p.languageHistogram);
      setSample(p.sample);
      setFirestoreOn(p.firestoreEnabled);
    } catch (e) {
      console.error('[BroadcastShell] applyMondayWelcome', e);
      setPreviewCount(null);
      setPreviewWithEmail(null);
      setHistogram(null);
      setSample(null);
      setFirestoreOn(null);
      setError(t('admin_broadcast_err_general'));
    } finally {
      setBusy(false);
    }
  }, [user, t]);

  const applyRenewal7Alerts = useCallback(async () => {
    if (!user) return;
    setSegment('subscription_expiring_7d');
    setMessages((prev) => {
      const next = { ...prev };
      for (const lang of BROADCAST_LANGS) {
        next[lang] = { ...RENEWAL_7_DRAFT[lang] };
      }
      return next;
    });
    setError(null);
    setSendResult(null);
    setBusy(true);
    try {
      const p = await broadcastPreview(user, { segment: 'subscription_expiring_7d' });
      setPreviewCount(p.count);
      setPreviewWithEmail(p.withEmail);
      setHistogram(p.languageHistogram);
      setSample(p.sample);
      setFirestoreOn(p.firestoreEnabled);
    } catch (e) {
      console.error('[BroadcastShell] applyRenewal7Alerts', e);
      setPreviewCount(null);
      setPreviewWithEmail(null);
      setHistogram(null);
      setSample(null);
      setFirestoreOn(null);
      setError(t('admin_broadcast_err_general'));
    } finally {
      setBusy(false);
    }
  }, [user, t]);

  const updateLang = useCallback((lang: string, field: 'subject' | 'body', value: string) => {
    setMessages((prev) => ({
      ...prev,
      [lang]: { ...prev[lang], [field]: value },
    }));
  }, []);

  const runSend = useCallback(async () => {
    if (!user || previewCount == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await broadcastSend(user, {
        segment,
        channel,
        messages,
        confirmRecipientCount: previewCount,
        confirmAck: 'BROADCAST_CONFIRM',
        ...(segment === 'new_users' ? { days } : {}),
      });
      setSendResult(
        t('admin_broadcast_send_summary', {
          audience: String(res.audience),
          sentEmail: String(res.sentEmail),
          failedEmail: String(res.failedEmail),
          sentPush: String(res.sentPush),
          skippedNoEmail: String(res.skippedNoEmail),
        }),
      );
      setConfirmOpen(false);
      setConfirmTyped('');
    } catch (e) {
      console.error('[BroadcastShell] runSend', e);
      setError(t('admin_broadcast_err_general'));
    } finally {
      setBusy(false);
    }
  }, [channel, days, messages, previewCount, segment, user, t]);

  const simulationText = useMemo(
    () => formatSimulationLine(previewCount ?? 0, histogram),
    [previewCount, histogram],
  );

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <p className="text-sm text-slate-500">Cargando sesión…</p>
      </div>
    );
  }

  if (!user || !isSuperAdminUser(user)) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-violet-50/40 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-700">Growth · Fase 3</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Communication Hub</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Audiences alineadas al dashboard (Mongo + Firestore opcional). Cada usuario recibe la variante en su{' '}
          <code className="rounded bg-slate-100 px-1">language</code> / <code className="rounded bg-slate-100 px-1">appLanguage</code>;
          si falta, se usa <strong>inglés</strong>. Simula antes de enviar.
        </p>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : null}
      {sendResult ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{sendResult}</div>
      ) : null}

      <section className="rounded-2xl border border-violet-200 bg-violet-50/90 p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-900">Simulación</h2>
        <p className="mt-3 text-lg font-medium leading-relaxed text-slate-900">{simulationText}</p>
        {previewWithEmail != null && previewCount != null && previewCount > 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Con dirección de email válida: <strong>{previewWithEmail}</strong> de {previewCount}
          </p>
        ) : null}
      </section>

      <section className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          disabled={busy}
          className="rounded-xl border border-violet-300 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          onClick={() => void applyMondayWelcome()}
        >
          Lunes de Bienvenida — últimos 7 días (simular + plantillas)
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-xl border border-amber-300 bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          onClick={() => void applyRenewal7Alerts()}
        >
          Alerta suscripción — vence en 7 días (lista rápida)
        </button>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Regla de envío</h2>
          <p className="mt-1 text-sm text-slate-500">{segmentMeta?.hint}</p>
          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Filtrar por regla
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
              value={segment}
              onChange={(e) => {
                setSegment(e.target.value);
                setPreviewCount(null);
                setHistogram(null);
                setSample(null);
              }}
            >
              <optgroup label="Reglas rápidas — Growth">
                {quickOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Más segmentos">
                {moreOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {segment === 'new_users' ? (
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Días (N)
              <input
                type="number"
                min={1}
                max={90}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                value={days}
                onChange={(e) => setDays(Number(e.target.value) || 7)}
              />
            </label>
          ) : null}
          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Canal
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-900"
              value={channel}
              onChange={(e) => setChannel(e.target.value as 'email' | 'push' | 'both')}
            >
              <option value="email">Solo email (Azure ACS)</option>
              <option value="push">Solo push (Expo)</option>
              <option value="both">Email + push</option>
            </select>
          </label>
          <div className="mt-6">
            <button
              type="button"
              disabled={busy}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void runPreview()}
            >
              {busy ? '…' : 'Simular audiencia'}
            </button>
          </div>
          {firestoreOn != null ? (
            <p className="mt-4 text-xs text-slate-500">
              Firestore admin:{' '}
              {firestoreOn ? 'activo' : 'no configurado — conteos pueden depender más de Mongo'}
            </p>
          ) : null}
          {sample?.length ? (
            <div className="mt-4 max-h-40 overflow-auto rounded-xl border border-slate-100 text-xs">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    <th className="px-2 py-1">Uid</th>
                    <th className="px-2 py-1">Email</th>
                    <th className="px-2 py-1">Lang</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.map((r) => (
                    <tr key={r.uid} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-mono text-[10px] text-slate-600">{r.uid.slice(0, 12)}…</td>
                      <td className="px-2 py-1 text-slate-700">{r.email || '—'}</td>
                      <td className="px-2 py-1">{r.language}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Redactar por idioma</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pestañas ES / EN / IT / FR / PT. El servidor asigna la plantilla según el idioma de cada perfil.
          </p>
          <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 pb-px">
            {BROADCAST_LANGS.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLangTab(code)}
                className={[
                  'rounded-t-lg px-4 py-2 text-sm font-semibold transition',
                  langTab === code
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                {LANG_TAB_LABEL[code]}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-b-xl rounded-tr-xl border border-slate-200 border-t-0 bg-slate-50/50 p-4">
            <label className="block text-xs font-medium text-slate-600">
              Asunto (email) / título (push)
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={messages[langTab]?.subject ?? ''}
                onChange={(e) => updateLang(langTab, 'subject', e.target.value)}
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Cuerpo
              <textarea
                className="mt-1 min-h-[140px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={messages[langTab]?.body ?? ''}
                onChange={(e) => updateLang(langTab, 'body', e.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6">
        <h2 className="text-lg font-semibold text-amber-950">Enviar</h2>
        <p className="mt-2 text-sm text-amber-900">
          Debe coincidir la simulación actual. Confirma escribiendo <code className="rounded bg-white px-1">BROADCAST_CONFIRM</code>.
        </p>
        <p className="mt-2 text-sm font-medium text-amber-950">{simulationText}</p>
        <button
          type="button"
          disabled={busy || previewCount == null || previewCount === 0}
          className="mt-4 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => {
            setConfirmOpen(true);
            setConfirmTyped('');
          }}
        >
          Enviar a {previewCount ?? '—'} usuarios
        </button>
      </section>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Confirmar envío masivo</h3>
            <p className="mt-2 text-sm text-slate-600">{simulationText}</p>
            <p className="mt-3 text-sm font-medium text-slate-800">
              Escribe <code className="rounded bg-slate-100 px-1">BROADCAST_CONFIRM</code>:
            </p>
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
              value={confirmTyped}
              onChange={(e) => setConfirmTyped(e.target.value)}
              autoComplete="off"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setConfirmOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || confirmTyped !== 'BROADCAST_CONFIRM'}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                onClick={() => void runSend()}
              >
                Enviar ahora
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
