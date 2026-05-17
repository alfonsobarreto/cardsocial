import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useAdminT } from '../i18n/useAdminT';
import {
  type ModerationReport,
  type ModerationVaultItem,
  type ReportStatus,
  type UserInvestigation,
  ReportAlreadyResolvedError,
  approveReportAction,
  banReportedUser,
  decryptModerationReportEvidence,
  deleteVaultLinkAndApproveReport,
  hardBanReportedUser,
  investigateUser,
  listReports,
  rejectReportAction,
  warnReportedUser,
} from '../services/moderationService';

type Notice = { type: 'success' | 'error'; message: string };

type ModerationTab = 'pending' | 'history';

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

/** Evidencia descifrada: texto del reporte + imagen opcional (Base64 en JSON o URL legada). */
function DecryptedEvidencePanel({ raw }: { raw: string }) {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      const summary = typeof o.reporterSummary === 'string' ? o.reporterSummary : '';
      const b64Raw =
        typeof o.evidenceImageBase64 === 'string' ? o.evidenceImageBase64.trim() : '';
      const imageSrcFromB64 = b64Raw
        ? b64Raw.startsWith('data:')
          ? b64Raw
          : `data:image/jpeg;base64,${b64Raw}`
        : '';
      const imageUrlRaw = typeof o.evidenceImageUrl === 'string' ? o.evidenceImageUrl.trim() : '';
      const safeHttpsUrl = /^https:\/\//i.test(imageUrlRaw) ? imageUrlRaw : '';
      const imageSrc = imageSrcFromB64 || safeHttpsUrl;
      const isExternalHttps = Boolean(safeHttpsUrl && !imageSrcFromB64);
      const forAudit = { ...o };
      if (
        typeof forAudit.evidenceImageBase64 === 'string' &&
        forAudit.evidenceImageBase64.length > 120
      ) {
        forAudit.evidenceImageBase64 = `[${forAudit.evidenceImageBase64.length} chars]`;
      }
      return (
        <div className="space-y-3">
          {summary ? (
            <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-800">
              {summary}
            </p>
          ) : null}
          {imageSrc ? (
            isExternalHttps ? (
              <a href={imageSrc} target="_blank" rel="noreferrer" className="block">
                <img
                  src={imageSrc}
                  alt="Evidencia visual del reporte"
                  className="max-h-[480px] w-auto max-w-full rounded-lg border border-slate-200 object-contain"
                />
              </a>
            ) : (
              <img
                src={imageSrc}
                alt="Evidencia visual del reporte"
                className="max-h-[480px] w-auto max-w-full rounded-lg border border-slate-200 object-contain"
              />
            )
          ) : null}
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {JSON.stringify(forAudit, null, 2)}
          </pre>
        </div>
      );
    }
  } catch {
    /* JSON legado o no parseable */
  }
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800">
      {raw}
    </pre>
  );
}

function statusBadge(status: ReportStatus, t: (key: string) => string) {
  const classes: Record<ReportStatus, string> = {
    pending: 'bg-amber-100 text-amber-800 ring-amber-200',
    resolved_approved: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
    resolved_rejected: 'bg-slate-200 text-slate-800 ring-slate-300',
  };
  const label =
    status === 'pending'
      ? t('admin_mod_status_pending')
      : status === 'resolved_approved'
        ? t('admin_mod_status_resolved_approved')
        : t('admin_mod_status_resolved_rejected');

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${classes[status]}`}>
      {label}
    </span>
  );
}

function VaultSection({
  title,
  items,
  onDeleteLink,
  deleteBusyId,
  deleteLinkLabel = 'Eliminar tarjeta (vault)',
}: {
  title: string;
  items: ModerationVaultItem[];
  onDeleteLink?: (linkId: string) => void;
  deleteBusyId?: string;
  deleteLinkLabel?: string;
}) {
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
                {item.isE2eOpaque ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                    E2E / zero-knowledge
                  </span>
                ) : null}
                {item.type && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {item.type}
                  </span>
                )}
              </div>
              {item.isE2eOpaque ? (
                <p className="text-xs font-medium leading-5 text-amber-900">
                  Contenido cifrado de extremo a extremo: la carga útil no es legible para administración (sin llave
                  maestra ni descifrado).
                </p>
              ) : null}
              {item.value && !item.isE2eOpaque ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.value}</p> : null}
              {item.url && !item.isE2eOpaque ? (
                <a className="block break-all text-sm font-medium text-blue-700 hover:underline" href={item.url} target="_blank" rel="noreferrer">
                  {item.url}
                </a>
              ) : null}
              {item.imageUrl && !item.isE2eOpaque ? (
                <a href={item.imageUrl} target="_blank" rel="noreferrer">
                  <img src={item.imageUrl} alt={item.title} className="mt-2 h-24 w-24 rounded-xl border border-slate-200 object-cover" />
                </a>
              ) : null}
              {onDeleteLink ? (
                <button
                  type="button"
                  className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                  disabled={Boolean(deleteBusyId)}
                  onClick={() => onDeleteLink(item.id)}
                >
                  {deleteBusyId === item.id ? 'Borrando…' : deleteLinkLabel}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Moderation() {
  const { t } = useAdminT();
  const { user } = useAuth();
  const filters = useMemo(
    () =>
      [
        { key: 'pending' as const, label: t('admin_mod_tab_pending') },
        { key: 'history' as const, label: t('admin_mod_tab_history') },
      ] as const,
    [t],
  );
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [activeTab, setActiveTab] = useState<ModerationTab>('pending');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [investigationReport, setInvestigationReport] = useState<ModerationReport | null>(null);
  const [investigation, setInvestigation] = useState<UserInvestigation | null>(null);
  const [investigationLoading, setInvestigationLoading] = useState(false);
  const [moderationReason, setModerationReason] = useState('');
  const [moderationPrivateKeyB64, setModerationPrivateKeyB64] = useState('');
  const [decryptedEvidence, setDecryptedEvidence] = useState<string | null>(null);
  const [evidenceDecryptError, setEvidenceDecryptError] = useState<string | null>(null);
  const [linkDeleteBusyId, setLinkDeleteBusyId] = useState('');

  const adminEmail = user?.email || 'unknown-admin';
  const adminUid = user?.uid || '';

  async function refreshReports() {
    try {
      setLoading(true);
      const nextReports = await listReports();
      setReports(nextReports);
    } catch (error) {
      console.error('[Moderation] Failed to load reports:', error);
      setNotice({ type: 'error', message: t('admin_mod_notice_load_fail') });
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
          setNotice({ type: 'error', message: t('admin_mod_notice_load_fail') });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadInitialReports();
    return () => {
      isMounted = false;
    };
  }, [t]);

  const filteredReports = useMemo(() => {
    if (activeTab === 'history') {
      return reports.filter(
        (r) => r.status === 'resolved_approved' || r.status === 'resolved_rejected',
      );
    }
    return reports.filter((r) => r.status === 'pending');
  }, [activeTab, reports]);

  const counters = useMemo(
    () => ({
      pending: reports.filter((r) => r.status === 'pending').length,
      history: reports.filter(
        (r) => r.status === 'resolved_approved' || r.status === 'resolved_rejected',
      ).length,
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
      if (error instanceof ReportAlreadyResolvedError) {
        setNotice({ type: 'error', message: t('admin_mod_notice_already_resolved') });
      } else {
        setNotice({ type: 'error', message: t('admin_err_action_general') });
      }
    } finally {
      setActionLoading('');
    }
  }

  const openInvestigation = async (report: ModerationReport) => {
    if (!report.reportedUserId) {
      setNotice({ type: 'error', message: t('admin_mod_notice_missing_reported_user') });
      return;
    }

    setInvestigationReport(report);
    setModerationReason(report.reason || '');
    setModerationPrivateKeyB64('');
    setDecryptedEvidence(null);
    setEvidenceDecryptError(null);
    setInvestigation(null);
    setInvestigationLoading(true);
    setNotice(null);

    try {
      const data = await investigateUser(report.reportedUserId);
      setInvestigation(data);
    } catch (error) {
      console.error('[Moderation] Investigation failed:', error);
      setNotice({ type: 'error', message: t('admin_mod_notice_xray_fail') });
    } finally {
      setInvestigationLoading(false);
    }
  };

  const closeInvestigation = () => {
    setInvestigationReport(null);
    setInvestigation(null);
    setModerationReason('');
    setModerationPrivateKeyB64('');
    setDecryptedEvidence(null);
    setEvidenceDecryptError(null);
  };

  const handleDecryptEvidence = () => {
    if (!investigationReport) return;
    setEvidenceDecryptError(null);
    try {
      const plain = decryptModerationReportEvidence(moderationPrivateKeyB64, investigationReport);
      setDecryptedEvidence(plain);
    } catch (error) {
      setDecryptedEvidence(null);
      setEvidenceDecryptError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDeleteVaultLink = (linkId: string) => {
    if (!investigationReport?.reportedUserId || !adminUid) {
      setNotice({ type: 'error', message: t('admin_err_action_general') });
      return;
    }
    const ok =
      typeof globalThis !== 'undefined' && 'confirm' in globalThis
        ? globalThis.confirm(
            'Confirma eliminación de la tarjeta en vault, cierre del reporte y notificación al denunciante. ¿Continuar?',
          )
        : true;
    if (!ok) return;

    const reason = requireReason();
    if (!reason) return;

    void (async () => {
      try {
        setLinkDeleteBusyId(linkId);
        setNotice(null);
        await deleteVaultLinkAndApproveReport(
          investigationReport.reportedUserId!,
          linkId,
          investigationReport,
          adminUid,
          adminEmail,
          reason,
        );
        const nextReports = await listReports();
        setReports(nextReports);
        const updated = nextReports.find((r) => r.id === investigationReport.id);
        if (updated) setInvestigationReport(updated);
        const data = await investigateUser(investigationReport.reportedUserId!);
        setInvestigation(data);
        setNotice({ type: 'success', message: t('admin_mod_success_resolve_delete') });
      } catch (error) {
        console.error('[Moderation] delete link atomic failed:', error);
        if (error instanceof ReportAlreadyResolvedError) {
          setNotice({ type: 'error', message: t('admin_mod_notice_already_resolved') });
        } else {
          setNotice({ type: 'error', message: t('admin_err_action_general') });
        }
      } finally {
        setLinkDeleteBusyId('');
      }
    })();
  };

  const requireReason = () => {
    const reason = moderationReason.trim();
    if (!reason) {
      setNotice({ type: 'error', message: t('admin_mod_notice_reason_required') });
      return null;
    }
    return reason;
  };

  const handleWarning = () => {
    if (!investigationReport || !adminUid) return;
    const reason = requireReason();
    if (!reason) return;

    void performAction(
      `warning:${investigationReport.id}`,
      t('admin_mod_success_warning'),
      () => warnReportedUser(investigationReport, adminUid, adminEmail, reason),
    ).then(closeInvestigation);
  };

  const handleSoftBan = () => {
    if (!investigationReport || !adminUid) return;
    const reason = requireReason();
    if (!reason) return;

    void performAction(
      `ban:${investigationReport.id}`,
      t('admin_mod_success_soft_ban'),
      () => banReportedUser(investigationReport, adminUid, adminEmail, reason),
    ).then(closeInvestigation);
  };

  const handleHardBan = () => {
    if (!investigationReport || !adminUid) return;
    const reason = requireReason();
    if (!reason) return;

    void performAction(
      `hard-ban:${investigationReport.id}`,
      t('admin_mod_success_hard_ban'),
      () => hardBanReportedUser(investigationReport, adminUid, adminEmail, reason),
    ).then(closeInvestigation);
  };

  const handleApproveClose = () => {
    if (!investigationReport || !adminUid) return;
    const reason = requireReason();
    if (!reason) return;
    void performAction(
      `approve:${investigationReport.id}`,
      t('admin_mod_success_reviewed'),
      () => approveReportAction(investigationReport, adminUid, adminEmail, reason),
    ).then(closeInvestigation);
  };

  const handleRejectClose = () => {
    if (!investigationReport || !adminUid) return;
    const reason = requireReason();
    if (!reason) return;
    void performAction(
      `reject:${investigationReport.id}`,
      t('admin_mod_success_dismissed'),
      () => rejectReportAction(investigationReport, adminUid, adminEmail, reason),
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
              Lista reportes, revisa metadatos de cuenta y aplica advertencias o suspensiones auditadas. Los ítems de
              bóveda con cifrado E2E se muestran en modo ciego: sin plaintext ni ciphertext para el equipo.
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

      <section className="grid gap-4 md:grid-cols-2">
        {filters.map((filter) => (
          <button
            key={filter.key}
            className={[
              'rounded-2xl border p-5 text-left shadow-sm transition',
              activeTab === filter.key
                ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-100'
                : 'border-slate-200 bg-white hover:border-slate-300',
            ].join(' ')}
            type="button"
            onClick={() => setActiveTab(filter.key)}
          >
            <p className="text-sm font-medium text-slate-500">{filter.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{counters[filter.key]}</p>
          </button>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-950">
            {activeTab === 'pending' ? t('admin_mod_tab_pending') : t('admin_mod_tab_history')}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t('admin_mod_table_helper')}
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
                    <td className="px-6 py-5">{statusBadge(report.status, t)}</td>
                    <td className="max-w-sm px-6 py-5">
                      <div className="font-medium text-slate-900">{report.reason}</div>
                      {report.details && <div className="mt-1 text-xs leading-5 text-slate-500">{report.details}</div>}
                      {report.evidenceStatus === 'missing' ? (
                        <div className="mt-2 rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">
                          Reporte Sin Evidencia Criptográfica / Posible Sabotaje
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-semibold text-slate-900">
                        {report.reportedUser?.displayName || shortId(report.reportedUserId)}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {report.reportedUser?.email || t('admin_mod_email_unavailable')}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {t('admin_mod_label_reported_user')}: {shortId(report.reportedUserId)}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {t('admin_mod_label_submitter')}: {shortId(report.reporterUserId)}
                      </div>
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
                          {activeTab === 'history' ? 'Ver detalle' : 'Investigar'}
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
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-600">Moderación · vista ciega</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                    {investigation?.profile?.displayName || shortId(investigationReport.reportedUserId)}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {investigation?.profile?.email || t('admin_mod_email_unavailable')} ·{' '}
                    {t('admin_mod_label_account_id')} {shortId(investigationReport.reportedUserId)}
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
                      {investigationReport.evidenceStatus === 'missing' ? (
                        <div className="mt-3 rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
                          Reporte Sin Evidencia Criptográfica / Posible Sabotaje
                        </div>
                      ) : null}
                      {investigationReport.evidenceStatus === 'present' ? (
                        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-medium text-slate-600">
                            Descifrado local en RAM: pega la clave privada X25519 de moderación (Base64). No se persiste en
                            disco.
                          </p>
                          <input
                            type="password"
                            autoComplete="off"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                            placeholder="Clave privada de moderación (Base64)"
                            value={moderationPrivateKeyB64}
                            onChange={(e) => setModerationPrivateKeyB64(e.target.value)}
                          />
                          <button
                            type="button"
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                            onClick={handleDecryptEvidence}
                          >
                            {t('admin_moderation_decrypt_btn')}
                          </button>
                          {evidenceDecryptError ? (
                            <p className="text-sm font-medium text-red-600">{evidenceDecryptError}</p>
                          ) : null}
                          {decryptedEvidence ? <DecryptedEvidencePanel raw={decryptedEvidence} /> : null}
                        </div>
                      ) : null}
                    </section>

                    <VaultSection
                      title="users/{uid}/links"
                      items={investigation?.links ?? []}
                      onDeleteLink={investigationReport.status === 'pending' ? handleDeleteVaultLink : undefined}
                      deleteBusyId={linkDeleteBusyId}
                      deleteLinkLabel={t('admin_mod_delete_link_resolve')}
                    />
                    <VaultSection title="users/{uid}/icon_vault" items={investigation?.iconVault ?? []} />
                    <VaultSection title="users/{uid}/vault" items={investigation?.vault ?? []} />
                  </div>

                  <div className="space-y-5">
                    {investigationReport.status !== 'pending' ? (
                      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
                        Este reporte ya está cerrado (
                        {investigationReport.status === 'resolved_approved'
                          ? t('admin_mod_status_resolved_approved')
                          : t('admin_mod_status_resolved_rejected')}
                        ). Vista de solo lectura.
                      </section>
                    ) : null}

                    {investigationReport.status === 'pending' ? (
                      <section className="rounded-2xl border border-slate-200 bg-white p-5">
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">Motivo obligatorio (auditoría)</span>
                          <textarea
                            className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100"
                            value={moderationReason}
                            onChange={(event) => setModerationReason(event.target.value)}
                            placeholder=""
                          />
                        </label>
                      </section>
                    ) : null}

                    {investigationReport.status === 'pending' ? (
                      <section className="rounded-2xl border border-emerald-200 bg-white p-5">
                        <h3 className="font-semibold text-slate-950">Resolución del reporte</h3>
                        <p className="mt-2 text-xs text-slate-600">Cierra el caso o elimina la tarjeta desde la columna izquierda.</p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            disabled={Boolean(actionLoading) || !adminUid}
                            className="flex-1 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                            onClick={handleApproveClose}
                          >
                            {t('admin_mod_btn_approve_close')}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(actionLoading) || !adminUid}
                            className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                            onClick={handleRejectClose}
                          >
                            {t('admin_mod_btn_reject_close')}
                          </button>
                        </div>
                      </section>
                    ) : null}

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

                    {investigationReport.status === 'pending' ? (
                    <section className="rounded-2xl border border-red-200 bg-white p-5">
                      <h3 className="font-semibold text-slate-950">Escala de castigos</h3>
                      <p className="mt-2 text-xs text-slate-600">Usa el mismo motivo de auditoría indicado arriba.</p>

                      <div className="mt-5 space-y-3">
                        <button
                          type="button"
                          disabled={Boolean(actionLoading) || !adminUid}
                          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                          onClick={handleWarning}
                        >
                          {actionLoading === `warning:${investigationReport.id}` ? 'Aplicando...' : 'Advertencia (Warning)'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading) || !adminUid}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          onClick={handleSoftBan}
                        >
                          {actionLoading === `ban:${investigationReport.id}` ? 'Suspendiendo...' : 'Soft Ban (Suspender)'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading) || !adminUid}
                          className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-black tracking-wide text-white hover:bg-red-800 disabled:opacity-60"
                          onClick={handleHardBan}
                        >
                          {actionLoading === `hard-ban:${investigationReport.id}` ? 'Aplicando hard ban...' : 'HARD BAN (Lista Negra)'}
                        </button>
                      </div>
                    </section>
                    ) : null}
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
