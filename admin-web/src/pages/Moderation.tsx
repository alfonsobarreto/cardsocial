import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  type ModerationReport,
  type ReportStatus,
  banReportedUser,
  dismissReport,
  listReports,
  markReportReviewed,
} from '../services/moderationService';

type Notice = {
  type: 'success' | 'error';
  message: string;
};

const filters: { key: ReportStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'dismissed', label: 'Dismissed' },
];

function formatDate(value: ModerationReport['createdAt']) {
  if (!value) return 'N/A';
  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    date = new Date(value);
  } else if (typeof value.toDate === 'function') {
    date = value.toDate();
  } else if (typeof value.seconds === 'number') {
    date = new Date(value.seconds * 1000);
  }

  if (!date || Number.isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('es-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function shortId(value?: string) {
  if (!value) return 'N/A';
  return value.length > 16 ? `${value.slice(0, 14)}...` : value;
}

function statusBadge(status: ReportStatus) {
  const classes: Record<ReportStatus, string> = {
    pending: 'bg-amber-100 text-amber-800 ring-amber-200',
    reviewed: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    dismissed: 'bg-slate-100 text-slate-700 ring-slate-200',
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${classes[status]}`}>
      {status}
    </span>
  );
}

export default function Moderation() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [activeFilter, setActiveFilter] = useState<ReportStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [banTarget, setBanTarget] = useState<ModerationReport | null>(null);
  const [banReason, setBanReason] = useState('');

  const adminEmail = user?.email || 'unknown-admin';

  async function refreshReports() {
    try {
      setLoading(true);
      const nextReports = await listReports();
      setReports(nextReports);
    } catch (error) {
      console.error('[Moderation] Failed to load reports:', error);
      setNotice({
        type: 'error',
        message: 'No se pudieron cargar los reportes. Revisa permisos de Firestore.',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialReports() {
      try {
        const nextReports = await listReports();

        if (isMounted) {
          setReports(nextReports);
        }
      } catch (error) {
        console.error('[Moderation] Failed to load reports:', error);

        if (isMounted) {
          setNotice({
            type: 'error',
            message: 'No se pudieron cargar los reportes. Revisa permisos de Firestore.',
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadInitialReports();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredReports = useMemo(
    () => reports.filter((report) => report.status === activeFilter),
    [activeFilter, reports],
  );

  const counters = useMemo(
    () => ({
      pending: reports.filter((report) => report.status === 'pending').length,
      reviewed: reports.filter((report) => report.status === 'reviewed').length,
      dismissed: reports.filter((report) => report.status === 'dismissed').length,
    }),
    [reports],
  );

  async function performAction(
    actionKey: string,
    successMessage: string,
    action: () => Promise<void>,
  ) {
    try {
      setActionLoading(actionKey);
      setNotice(null);
      await action();
      await refreshReports();
      setNotice({ type: 'success', message: successMessage });
    } catch (error) {
      console.error('[Moderation] Action failed:', error);
      setNotice({ type: 'error', message: 'No se pudo completar la accion.' });
    } finally {
      setActionLoading('');
    }
  }

  const handleReviewed = (report: ModerationReport) => {
    void performAction(
      `reviewed:${report.id}`,
      'Reporte marcado como revisado.',
      () => markReportReviewed(report.id, adminEmail),
    );
  };

  const handleDismiss = (report: ModerationReport) => {
    void performAction(
      `dismiss:${report.id}`,
      'Reporte desestimado correctamente.',
      () => dismissReport(report.id, adminEmail),
    );
  };

  const openBanModal = (report: ModerationReport) => {
    setBanTarget(report);
    setBanReason(report.reason || '');
    setNotice(null);
  };

  const closeBanModal = () => {
    setBanTarget(null);
    setBanReason('');
  };

  const handleBanSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!banTarget) return;
    const reason = banReason.trim();

    if (!reason) {
      setNotice({ type: 'error', message: 'El motivo de ban es obligatorio.' });
      return;
    }

    void performAction(
      `ban:${banTarget.id}`,
      'Usuario baneado y reporte auditado correctamente.',
      () => banReportedUser(banTarget, adminEmail, reason),
    ).then(closeBanModal);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">
              Trust & Safety
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">Moderacion</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Revisa reportes, desestima falsos positivos y aplica bans con auditoria obligatoria.
            </p>
          </div>

          <button
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void refreshReports()}
            disabled={loading}
          >
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </section>

      {notice && (
        <div
          className={[
            'rounded-2xl border px-5 py-4 text-sm font-medium',
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700',
          ].join(' ')}
        >
          {notice.message}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {filters.map((filter) => (
          <button
            key={filter.key}
            className={[
              'rounded-2xl border p-5 text-left shadow-sm transition',
              activeFilter === filter.key
                ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-100'
                : 'border-slate-200 bg-white hover:border-slate-300',
            ].join(' ')}
            type="button"
            onClick={() => setActiveFilter(filter.key)}
          >
            <p className="text-sm font-medium text-slate-500">{filter.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{counters[filter.key]}</p>
          </button>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-950">Reportes {activeFilter}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Todas las acciones escriben `reviewedBy` y `reviewedAt` en Firestore.
          </p>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm font-medium text-slate-500">
            Cargando reportes...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm font-medium text-slate-500">
            No hay reportes en este estado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Tipo</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Motivo</th>
                  <th className="px-6 py-4 font-semibold">Usuario reportado</th>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                  <th className="px-6 py-4 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReports.map((report) => (
                  <tr key={report.id} className="align-top transition hover:bg-slate-50/80">
                    <td className="px-6 py-5">
                      <div className="font-semibold capitalize text-slate-900">{report.type}</div>
                      <div className="mt-1 text-xs text-slate-500">{shortId(report.id)}</div>
                    </td>
                    <td className="px-6 py-5">{statusBadge(report.status)}</td>
                    <td className="max-w-sm px-6 py-5">
                      <div className="font-medium text-slate-900">{report.reason}</div>
                      {report.details && (
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                          {report.details}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-medium text-slate-900">{shortId(report.reportedUserId)}</div>
                      <div className="mt-1 text-xs text-slate-500">Reporter: {shortId(report.reporterUserId)}</div>
                    </td>
                    <td className="px-6 py-5 text-slate-600">{formatDate(report.createdAt)}</td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => handleReviewed(report)}
                        >
                          {actionLoading === `reviewed:${report.id}` ? 'Guardando...' : 'Revisado'}
                        </button>
                        <button
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => handleDismiss(report)}
                        >
                          {actionLoading === `dismiss:${report.id}` ? 'Guardando...' : 'Desestimar'}
                        </button>
                        <button
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                          type="button"
                          disabled={Boolean(actionLoading) || !report.reportedUserId}
                          onClick={() => openBanModal(report)}
                        >
                          Banear
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {banTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <form
            className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
            onSubmit={handleBanSubmit}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-600">
              Accion sensible
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Banear usuario</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Se escribira `isBanned`, `bannedAt` y `banReason` en `users`, y el reporte quedara
              auditado con tu email.
            </p>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-slate-700">Motivo obligatorio</span>
              <textarea
                className="mt-2 min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
                value={banReason}
                onChange={(event) => setBanReason(event.target.value)}
                required
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                type="button"
                onClick={closeBanModal}
              >
                Cancelar
              </button>
              <button
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={Boolean(actionLoading)}
              >
                {actionLoading === `ban:${banTarget.id}` ? 'Baneando...' : 'Confirmar ban'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
