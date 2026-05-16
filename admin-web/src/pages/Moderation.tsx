import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  type ModerationReport,
  type ModerationVaultItem,
  type ReportStatus,
  type UserInvestigation,
  banReportedUser,
  dismissReport,
  hardBanReportedUser,
  investigateUser,
  listReports,
  markReportReviewed,
  warnReportedUser,
} from '../services/moderationService';

type Notice = { type: 'success' | 'error'; message: string };

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
  return new Intl.DateTimeFormat('es-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function shortId(value?: string) {
  if (!value) return 'N/A';
  return value.length > 18 ? `${value.slice(0, 16)}...` : value;
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

function VaultSection({ title, items }: { title: string; items: ModerationVaultItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-950">{title}</h3>
        <p className="text-xs text-slate-500">{items.length} registros auditables</p>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">Sin datos visibles en esta colección.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <article key={`${item.source}:${item.id}`} className="space-y-2 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{item.title}</span>
                {item.type && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {item.type}
                  </span>
                )}
              </div>
              {item.value && <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.value}</p>}
              {item.url && (
                <a className="block break-all text-sm font-medium text-blue-700 hover:underline" href={item.url} target="_blank" rel="noreferrer">
                  {item.url}
                </a>
              )}
              {item.imageUrl && (
                <a href={item.imageUrl} target="_blank" rel="noreferrer">
                  <img src={item.imageUrl} alt={item.title} className="mt-2 h-24 w-24 rounded-xl border border-slate-200 object-cover" />
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Moderation() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [activeFilter, setActiveFilter] = useState<ReportStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [investigationReport, setInvestigationReport] = useState<ModerationReport | null>(null);
  const [investigation, setInvestigation] = useState<UserInvestigation | null>(null);
  const [investigationLoading, setInvestigationLoading] = useState(false);
  const [moderationReason, setModerationReason] = useState('');

  const adminEmail = user?.email || 'unknown-admin';

  async function refreshReports() {
    try {
      setLoading(true);
      const nextReports = await listReports();
      setReports(nextReports);
    } catch (error) {
      console.error('[Moderation] Failed to load reports:', error);
      setNotice({ type: 'error', message: 'No se pudieron cargar los reportes. Por favor, reintenta.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialReports() {
      try {
        const nextReports = await listReports();
        if (isMounted) setReports(nextReports);
      } catch (error) {
        console.error('[Moderation] Failed to load reports:', error);
        if (isMounted) {
          setNotice({ type: 'error', message: 'No se pudieron cargar los reportes. Por favor, reintenta.' });
        }
      } finally {
        if (isMounted) setLoading(false);
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

  async function performAction(actionKey: string, successMessage: string, action: () => Promise<void>) {
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

  const openInvestigation = async (report: ModerationReport) => {
    if (!report.reportedUserId) {
      setNotice({ type: 'error', message: 'Este reporte no incluye reportedUserId.' });
      return;
    }

    setInvestigationReport(report);
    setModerationReason(report.reason || '');
    setInvestigation(null);
    setInvestigationLoading(true);
    setNotice(null);

    try {
      const data = await investigateUser(report.reportedUserId);
      setInvestigation(data);
    } catch (error) {
      console.error('[Moderation] Investigation failed:', error);
      setNotice({ type: 'error', message: 'No se pudo abrir Modo Rayos X.' });
    } finally {
      setInvestigationLoading(false);
    }
  };

  const closeInvestigation = () => {
    setInvestigationReport(null);
    setInvestigation(null);
    setModerationReason('');
  };

  const requireReason = () => {
    const reason = moderationReason.trim();
    if (!reason) {
      setNotice({ type: 'error', message: 'El motivo de moderacion es obligatorio.' });
      return null;
    }
    return reason;
  };

  const handleWarning = () => {
    if (!investigationReport) return;
    const reason = requireReason();
    if (!reason) return;

    void performAction(
      `warning:${investigationReport.id}`,
      'Advertencia registrada y reporte auditado.',
      () => warnReportedUser(investigationReport, adminEmail, reason),
    ).then(closeInvestigation);
  };

  const handleSoftBan = () => {
    if (!investigationReport) return;
    const reason = requireReason();
    if (!reason) return;

    void performAction(
      `ban:${investigationReport.id}`,
      'Usuario suspendido y reporte auditado.',
      () => banReportedUser(investigationReport, adminEmail, reason),
    ).then(closeInvestigation);
  };

  const handleHardBan = () => {
    if (!investigationReport) return;
    const reason = requireReason();
    if (!reason) return;

    void performAction(
      `hard-ban:${investigationReport.id}`,
      'Hard ban aplicado y identidad agregada a banned_identities.',
      () => hardBanReportedUser(investigationReport, adminEmail, reason),
    ).then(closeInvestigation);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600">Trust & Safety</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">Moderacion empresarial</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Investiga el Vault público del usuario, revisa links activos y aplica una escala de penalizaciones auditada.
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
            La tabla cruza UID con `users` para mostrar nombre/email del reportado.
          </p>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm font-medium text-slate-500">Cargando reportes...</div>
        ) : filteredReports.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm font-medium text-slate-500">No hay reportes en este estado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Tipo</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Motivo</th>
                  <th className="px-6 py-4 font-semibold">Reportado</th>
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
                      {report.details && <div className="mt-1 text-xs leading-5 text-slate-500">{report.details}</div>}
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-semibold text-slate-900">
                        {report.reportedUser?.displayName || shortId(report.reportedUserId)}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">{report.reportedUser?.email || 'Email no disponible'}</div>
                      <div className="mt-1 text-xs text-slate-400">UID: {shortId(report.reportedUserId)}</div>
                      <div className="mt-1 text-xs text-slate-400">Reporter: {shortId(report.reporterUserId)}</div>
                    </td>
                    <td className="px-6 py-5 text-slate-600">{formatDate(report.createdAt)}</td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                          type="button"
                          disabled={Boolean(actionLoading) || !report.reportedUserId}
                          onClick={() => void openInvestigation(report)}
                        >
                          Investigar
                        </button>
                        <button
                          className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            void performAction(
                              `reviewed:${report.id}`,
                              'Reporte marcado como revisado.',
                              () => markReportReviewed(report.id, adminEmail, report.sourceCollection),
                            )
                          }
                        >
                          Revisado
                        </button>
                        <button
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            void performAction(
                              `dismiss:${report.id}`,
                              'Reporte desestimado correctamente.',
                              () => dismissReport(report.id, adminEmail, report.sourceCollection),
                            )
                          }
                        >
                          Desestimar
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

      {investigationReport && (
        <div className="fixed inset-0 z-50 bg-slate-950/70">
          <aside className="ml-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-slate-50 shadow-2xl">
            <header className="border-b border-slate-200 bg-white px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-600">Modo Rayos X</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                    {investigation?.profile?.displayName || shortId(investigationReport.reportedUserId)}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {investigation?.profile?.email || 'Email no disponible'} · UID {shortId(investigationReport.reportedUserId)}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={closeInvestigation}
                >
                  Cerrar
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
              {investigationLoading ? (
                <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center text-sm font-medium text-slate-500">
                  Cargando perfil, links y bóveda...
                </div>
              ) : (
                <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
                  <div className="space-y-5">
                    <section className="rounded-2xl border border-slate-200 bg-white p-5">
                      <h3 className="font-semibold text-slate-950">Reporte origen</h3>
                      <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                        <div><strong>Motivo:</strong> {investigationReport.reason}</div>
                        <div><strong>Tipo:</strong> {investigationReport.type}</div>
                        <div><strong>Target card:</strong> {investigationReport.targetCardId || 'N/A'}</div>
                        <div><strong>Creado:</strong> {formatDate(investigationReport.createdAt)}</div>
                      </div>
                      {investigationReport.details && (
                        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                          {investigationReport.details}
                        </p>
                      )}
                    </section>

                    <VaultSection title="users/{uid}/links" items={investigation?.links ?? []} />
                    <VaultSection title="users/{uid}/icon_vault" items={investigation?.iconVault ?? []} />
                    <VaultSection title="users/{uid}/vault" items={investigation?.vault ?? []} />
                  </div>

                  <div className="space-y-5">
                    <section className="rounded-2xl border border-slate-200 bg-white p-5">
                      <h3 className="font-semibold text-slate-950">Identidad</h3>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nombre</dt>
                          <dd className="mt-1 text-slate-900">{investigation?.profile?.displayName || 'N/A'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</dt>
                          <dd className="mt-1 break-all text-slate-900">{investigation?.profile?.email || 'N/A'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Telefono</dt>
                          <dd className="mt-1 text-slate-900">{investigation?.profile?.phoneNumber || 'N/A'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Warnings</dt>
                          <dd className="mt-1 text-slate-900">{investigation?.profile?.warnings ?? 0}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-2xl border border-red-200 bg-white p-5">
                      <h3 className="font-semibold text-slate-950">Escala de castigos</h3>
                      <label className="mt-4 block">
                        <span className="text-sm font-medium text-slate-700">Motivo obligatorio</span>
                        <textarea
                          className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
                          value={moderationReason}
                          onChange={(event) => setModerationReason(event.target.value)}
                        />
                      </label>

                      <div className="mt-5 space-y-3">
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                          onClick={handleWarning}
                        >
                          {actionLoading === `warning:${investigationReport.id}` ? 'Aplicando...' : 'Advertencia (Warning)'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          onClick={handleSoftBan}
                        >
                          {actionLoading === `ban:${investigationReport.id}` ? 'Suspendiendo...' : 'Soft Ban (Suspender)'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-black tracking-wide text-white hover:bg-red-800 disabled:opacity-60"
                          onClick={handleHardBan}
                        >
                          {actionLoading === `hard-ban:${investigationReport.id}` ? 'Aplicando hard ban...' : 'HARD BAN (Lista Negra)'}
                        </button>
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
