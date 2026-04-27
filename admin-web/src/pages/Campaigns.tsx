import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { type QRGift, createQRGift, getQRGifts } from '../services/qrGiftService';

type Toast = { type: 'success' | 'error'; message: string };

function formatDate(value: QRGift['createdAt'] | QRGift['expiresAt']) {
  if (!value) return 'Sin expiración';
  const date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate() : null;
  if (!date) return 'Pendiente';
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusStyles(status: QRGift['status']) {
  if (status === 'depleted') return 'bg-slate-100 text-slate-700';
  if (status === 'expired') return 'bg-red-100 text-red-700';
  return 'bg-emerald-100 text-emerald-700';
}

export default function Campaigns() {
  const { user } = useAuth();
  const [gifts, setGifts] = useState<QRGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [lastGift, setLastGift] = useState<QRGift | null>(null);

  const [creditsPerUse, setCreditsPerUse] = useState(500);
  const [monthsPerUse, setMonthsPerUse] = useState(1);
  const [maxUses, setMaxUses] = useState(50);
  const [expiresInDays, setExpiresInDays] = useState(30);

  const totalCreditsPool = useMemo(
    () => Math.max(0, creditsPerUse) * Math.max(1, maxUses),
    [creditsPerUse, maxUses],
  );

  async function refreshGifts() {
    try {
      setLoading(true);
      const list = await getQRGifts();
      setGifts(list);
    } catch (error) {
      console.error('[Campaigns] Failed to load QR gifts:', error);
      setToast({ type: 'error', message: 'No se pudieron cargar los QR gifts.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const list = await getQRGifts();
        if (isMounted) setGifts(list);
      } catch (error) {
        console.error('[Campaigns] Failed to load QR gifts:', error);
        if (isMounted) {
          setToast({ type: 'error', message: 'No se pudieron cargar los QR gifts.' });
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
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      setToast({ type: 'error', message: 'Sesión no disponible. Vuelve a iniciar sesión.' });
      return;
    }

    setSubmitting(true);
    setToast(null);

    try {
      const gift = await createQRGift({
        createdBy: user.uid,
        createdByEmail: user.email,
        creditsPerUse,
        monthsPerUse,
        maxUses,
        expiresInDays,
      });

      setLastGift(gift);
      await refreshGifts();
      setToast({
        type: 'success',
        message: 'QR gift creado en Firestore sin descontar saldo del SuperAdmin.',
      });
    } catch (error) {
      console.error('[Campaigns] Create QR gift failed:', error);
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo crear el QR gift.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyQrCode = async (qrCode: string) => {
    try {
      await navigator.clipboard.writeText(qrCode);
      setToast({ type: 'success', message: 'Link del QR copiado.' });
    } catch (error) {
      console.error('[Campaigns] Clipboard failed:', error);
      setToast({ type: 'error', message: 'No se pudo copiar el link.' });
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">
              Campañas VIP / QR Generator
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Generador de QR Gifts</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Crea códigos QR para regalar CS Coins y meses premium desde el Admin Web. Esta versión
              guarda en <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">qr_gifts</code>{' '}
              y <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">admin_audit</code>, pero
              no descuenta saldo del SuperAdmin.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <div className="font-semibold">Pase maestro aplicado</div>
            <div className="mt-1">creditsDeducted = 0 · noBalanceDeduction = true</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <form
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={handleCreate}
        >
          <h2 className="text-xl font-semibold text-slate-950">Nuevo QR de regalo</h2>
          <p className="mt-1 text-sm text-slate-500">
            Define el beneficio por canje y el cupo máximo del código.
          </p>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-slate-700">CS Coins por usuario</span>
            <input
              type="number"
              min={0}
              step={50}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
              value={creditsPerUse}
              onChange={(e) => setCreditsPerUse(Number.parseInt(e.target.value, 10) || 0)}
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
              onChange={(e) => setMonthsPerUse(Number.parseInt(e.target.value, 10) || 0)}
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
              value={maxUses}
              onChange={(e) => setMaxUses(Number.parseInt(e.target.value, 10) || 1)}
            />
            <span className="mt-1 block text-xs text-slate-500">Máximo 500 personas por QR.</span>
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Expira en días</span>
            <input
              type="number"
              min={0}
              max={90}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number.parseInt(e.target.value, 10) || 0)}
            />
            <span className="mt-1 block text-xs text-slate-500">Usa 0 para no poner expiración.</span>
          </label>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pool calculado
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-950">
              {totalCreditsPool.toLocaleString()} CS Coins
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Solo para auditoría. No se descuenta del balance del admin.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? 'Generando QR...' : 'Generar QR Gift'}
          </button>
        </form>

        <div className="space-y-6">
          {lastGift && (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
                Último QR creado
              </p>
              <div className="mt-3 rounded-2xl bg-white p-4">
                <code className="break-all text-sm font-semibold text-slate-900">{lastGift.qrCode}</code>
              </div>
              <button
                type="button"
                className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                onClick={() => void copyQrCode(lastGift.qrCode)}
              >
                Copiar link para QR
              </button>
            </section>
          )}

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Historial de QR gifts</h2>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void refreshGifts()}
              >
                Refrescar
              </button>
            </div>

            {loading ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">Cargando QR gifts...</div>
            ) : gifts.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                No hay QR gifts todavía. Crea el primero con el formulario.
              </div>
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
                      <th className="px-6 py-4 font-semibold">Acción</th>
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
                              statusStyles(gift.status),
                            ].join(' ')}
                          >
                            {gift.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => void copyQrCode(gift.qrCode)}
                          >
                            Copiar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
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
