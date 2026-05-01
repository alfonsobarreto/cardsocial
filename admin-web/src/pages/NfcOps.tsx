import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  type NfcBatch,
  type NfcCard,
  type NfcStatus,
  generateNfcBatch,
  listNfcCards,
  nfcCardsToCsv,
  updateNfcCardStatus,
} from '../services/nfcService';

type NfcTab = 'factory' | 'inventory';
type Toast = { type: 'success' | 'error'; message: string };

const STATUS_OPTIONS: (NfcStatus | 'all')[] = ['all', 'unclaimed', 'active', 'paused', 'lost', 'blocked'];

function statusStyles(status: NfcStatus) {
  const map: Record<NfcStatus, string> = {
    unclaimed: 'bg-slate-100 text-slate-700',
    active: 'bg-emerald-100 text-emerald-800',
    paused: 'bg-amber-100 text-amber-900',
    lost: 'bg-orange-100 text-orange-800',
    blocked: 'bg-red-100 text-red-800',
  };

  return map[status];
}

function downloadCsv(batch: NfcBatch) {
  const csv = nfcCardsToCsv(batch.cards);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${batch.batchId}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function NfcOps() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<NfcTab>('factory');
  const [quantity, setQuantity] = useState(100);
  const [lastBatch, setLastBatch] = useState<NfcBatch | null>(null);
  const [cards, setCards] = useState<NfcCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [statusFilter, setStatusFilter] = useState<NfcStatus | 'all'>('all');
  const [revealedPins, setRevealedPins] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);

  const filteredCards = useMemo(() => {
    if (statusFilter === 'all') return cards;
    return cards.filter((card) => card.status === statusFilter);
  }, [cards, statusFilter]);

  const refreshCards = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const list = await listNfcCards(user);
      setCards((prev) => {
        const byId = new Map<string, NfcCard>();
        for (const card of [...list, ...prev]) {
          byId.set(card.nfcCardId, card);
        }
        return Array.from(byId.values());
      });
    } catch (error) {
      console.error('[NfcOps] Failed to load inventory:', error);
      setToast({ type: 'error', message: 'No se pudo cargar el inventario NFC.' });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void refreshCards();
  }, [user, refreshCards]);

  useEffect(() => {
    if (!toast || toast.type !== 'success') return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleGenerateBatch = async () => {
    if (!user) {
      setToast({ type: 'error', message: 'Inicia sesión para generar lotes NFC.' });
      return;
    }
    setGenerating(true);
    setToast(null);

    try {
      const batch = await generateNfcBatch(user, quantity);
      setLastBatch(batch);
      setCards((prev) => [...batch.cards, ...prev]);
      setToast({
        type: 'success',
        message:
          batch.source === 'api'
            ? 'Lote NFC generado desde backend.'
            : 'Lote NFC simulado. El endpoint admin todavía no está activo.',
      });
    } catch (error) {
      console.error('[NfcOps] Generate failed:', error);
      setToast({ type: 'error', message: 'No se pudo generar el lote NFC.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleStatusUpdate = async (card: NfcCard, status: Extract<NfcStatus, 'lost' | 'blocked'>) => {
    if (!user) {
      setToast({ type: 'error', message: 'Inicia sesión para actualizar el inventario.' });
      return;
    }
    setUpdatingId(card.nfcCardId);
    setToast(null);

    try {
      await updateNfcCardStatus(user, card.nfcCardId, status);
      setCards((prev) =>
        prev.map((item) => (item.nfcCardId === card.nfcCardId ? { ...item, status } : item)),
      );
      setToast({ type: 'success', message: status === 'blocked' ? 'Tarjeta bloqueada.' : 'Tarjeta marcada perdida.' });
    } catch (error) {
      console.error('[NfcOps] Status update failed:', error);
      setToast({ type: 'error', message: 'No se pudo actualizar la tarjeta NFC.' });
    } finally {
      setUpdatingId('');
    }
  };

  const togglePin = (nfcCardId: string) => {
    setRevealedPins((prev) => {
      const next = new Set(prev);
      if (next.has(nfcCardId)) {
        next.delete(nfcCardId);
      } else {
        next.add(nfcCardId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-950 p-8 text-white shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
          NFC Operations &amp; Manufacturing
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Centro industrial NFC</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Genera lotes para fabricación, exporta CSV para proveedor y monitorea el inventario logístico.
          Datos finales: MongoDB vía backend Azure en <code>/api/admin/nfc</code>.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          {[
            ['factory', 'Fábrica (Generación)', 'Lotes NFC + PIN para manufactura'],
            ['inventory', 'Inventario (Logística)', 'Radar de estado y destino montado'],
          ].map(([key, label, description]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as NfcTab)}
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

      {activeTab === 'factory' ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950">Generar lote NFC</h2>
            <p className="mt-1 text-sm text-slate-500">
              Cada tarjeta sale como <code>unclaimed</code> con PIN de activación de 6 caracteres (A–Z / 0–9).
            </p>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-slate-700">Cantidad a generar</span>
              <input
                type="number"
                min={1}
                max={5000}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                value={quantity}
                onChange={(event) => setQuantity(Number.parseInt(event.target.value, 10) || 1)}
              />
              <span className="mt-1 block text-xs text-slate-500">Ejemplo: 100 o 500.</span>
            </label>

            <button
              type="button"
              disabled={generating}
              className="mt-6 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-60"
              onClick={() => void handleGenerateBatch()}
            >
              {generating ? 'Generando lote...' : 'Generar Lote NFC'}
            </button>

            <button
              type="button"
              disabled={!lastBatch}
              className="mt-3 w-full rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              onClick={() => lastBatch && downloadCsv(lastBatch)}
            >
              Descargar CSV del último lote
            </button>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Último lote generado</h2>
              <p className="mt-1 text-xs text-slate-500">
                {lastBatch
                  ? `${lastBatch.cards.length} tarjetas · fuente ${lastBatch.source}`
                  : 'Todavía no hay lote en esta sesión.'}
              </p>
            </div>

            {!lastBatch ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                Genera un lote para ver la muestra y descargar CSV.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">ID de Tarjeta</th>
                      <th className="px-6 py-4 font-semibold">PIN</th>
                      <th className="px-6 py-4 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lastBatch.cards.slice(0, 12).map((card) => (
                      <tr key={card.nfcCardId}>
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-900">{card.nfcCardId}</td>
                        <td className="px-6 py-4 font-mono text-slate-700">{card.activationPin}</td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles(card.status)}`}>
                            {card.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lastBatch.cards.length > 12 && (
                  <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
                    Mostrando 12 de {lastBatch.cards.length}. El CSV incluye el lote completo.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Radar logístico NFC</h2>
              <p className="mt-1 text-xs text-slate-500">Inventario MongoDB vía backend Azure.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={[
                    'rounded-xl px-3 py-2 text-xs font-semibold transition',
                    statusFilter === status
                      ? 'bg-slate-950 text-white'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-50',
                  ].join(' ')}
                  onClick={() => setStatusFilter(status)}
                >
                  {status === 'all' ? 'Todos' : status}
                </button>
              ))}
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void refreshCards()}
              >
                Refrescar
              </button>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">Cargando inventario NFC...</div>
          ) : filteredCards.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">No hay tarjetas con este filtro.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">ID de Tarjeta</th>
                    <th className="px-6 py-4 font-semibold">PIN</th>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                    <th className="px-6 py-4 font-semibold">Dueño</th>
                    <th className="px-6 py-4 font-semibold">Destino actual</th>
                    <th className="px-6 py-4 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCards.map((card) => {
                    const pinVisible = revealedPins.has(card.nfcCardId);
                    return (
                      <tr key={card.nfcCardId} className="hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-900">{card.nfcCardId}</td>
                        <td className="px-6 py-4">
                          {card.activationPin ? (
                            <button
                              type="button"
                              className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700"
                              onClick={() => togglePin(card.nfcCardId)}
                            >
                              {pinVisible ? card.activationPin : '••••••'}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Reclamada</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles(card.status)}`}>
                            {card.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{card.owner || 'Sin dueño'}</td>
                        <td className="px-6 py-4">
                          {card.mountedUrl ? (
                            <a
                              href={card.mountedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block max-w-[260px] truncate font-medium text-cyan-700 hover:underline"
                            >
                              {card.mountedUrl}
                            </a>
                          ) : (
                            <span className="text-slate-400">Sin montar</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={updatingId === card.nfcCardId || card.status === 'blocked'}
                              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                              onClick={() => void handleStatusUpdate(card, 'blocked')}
                            >
                              Bloquear
                            </button>
                            <button
                              type="button"
                              disabled={updatingId === card.nfcCardId || card.status === 'lost'}
                              className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                              onClick={() => void handleStatusUpdate(card, 'lost')}
                            >
                              Marcar Perdida
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
