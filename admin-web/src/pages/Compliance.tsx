import { type FormEvent, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  type ComplianceUser,
  downloadUserDataJson,
  executeLegalDeletion,
  findComplianceUser,
  getUserExportData,
} from '../services/complianceService';

type Toast = { type: 'success' | 'error'; message: string };

function formatDate(value: unknown) {
  if (!value) return 'No registrado';
  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    date = new Date(value);
  } else if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') {
    date = value.toDate();
  } else if (typeof value === 'object' && value && 'seconds' in value && typeof value.seconds === 'number') {
    date = new Date(value.seconds * 1000);
  }

  if (!date || Number.isNaN(date.getTime())) return 'No registrado';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function ConsentRow({ label, value }: { label: string; value: unknown }) {
  const hasValue = Boolean(value);

  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{formatDate(value)}</p>
      </div>
      <span
        className={[
          'rounded-full px-2.5 py-1 text-xs font-semibold',
          hasValue ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
        ].join(' ')}
      >
        {hasValue ? 'Aceptado' : 'Pendiente'}
      </span>
    </div>
  );
}

export default function Compliance() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [foundUser, setFoundUser] = useState<ComplianceUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [requestedByEmail, setRequestedByEmail] = useState('');

  const adminEmail = user?.email || 'unknown-admin';

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setToast(null);
    setFoundUser(null);

    try {
      const result = await findComplianceUser(search);
      if (!result) {
        setToast({ type: 'error', message: 'No se encontró un usuario con ese email o UID.' });
        return;
      }
      setFoundUser(result);
      setRequestedByEmail(result.email);
    } catch (error) {
      console.error('[Compliance] Search failed:', error);
      setToast({ type: 'error', message: 'No se pudo completar la búsqueda legal.' });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!foundUser) return;
    setActionLoading('export');
    setToast(null);

    try {
      const data = await getUserExportData(foundUser.uid);
      downloadUserDataJson(foundUser.uid, data);
      setToast({ type: 'success', message: 'Exportación JSON generada correctamente.' });
    } catch (error) {
      console.error('[Compliance] Export failed:', error);
      setToast({ type: 'error', message: 'No se pudo exportar la data del usuario.' });
    } finally {
      setActionLoading('');
    }
  };

  const handleDeletion = async () => {
    if (!foundUser || deleteConfirmation !== 'ELIMINAR') return;
    setActionLoading('delete');
    setToast(null);

    try {
      await executeLegalDeletion({
        uid: foundUser.uid,
        requestedByEmail: requestedByEmail.trim() || foundUser.email,
        executedByAdmin: adminEmail,
      });
      setToast({ type: 'success', message: 'Eliminación legal ejecutada y auditada.' });
      setDeleteModalOpen(false);
      setDeleteConfirmation('');
      const refreshed = await findComplianceUser(foundUser.uid);
      setFoundUser(refreshed);
    } catch (error) {
      console.error('[Compliance] Legal deletion failed:', error);
      setToast({ type: 'error', message: 'No se pudo ejecutar la eliminación legal.' });
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">
          Compliance Ops
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Legal & Privacy Center</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Centro operativo para solicitudes GDPR/CCPA: búsqueda legal, exportación de datos y
          eliminación/anominización auditada.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSearch}>
          <input
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por email o UID"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? 'Buscando...' : 'Buscar usuario'}
          </button>
        </form>
      </section>

      {toast && (
        <div
          className={[
            'rounded-2xl border px-5 py-4 text-sm font-medium',
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700',
          ].join(' ')}
        >
          {toast.message}
        </div>
      )}

      {foundUser && (
        <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Identidad
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">{foundUser.displayName}</h2>
                  <p className="mt-1 break-all text-sm text-slate-600">{foundUser.email || 'Email no disponible'}</p>
                  <p className="mt-1 font-mono text-xs text-slate-400">{foundUser.uid}</p>
                </div>
                <span
                  className={[
                    'rounded-full px-3 py-1 text-xs font-semibold',
                    foundUser.isDeleted ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800',
                  ].join(' ')}
                >
                  {foundUser.isDeleted ? 'Deleted / Anonymized' : 'Active'}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Teléfono</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{foundUser.phoneNumber || 'No registrado'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Registro</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(foundUser.createdAt)}</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950">Estado de consentimientos</h2>
              <div className="mt-5 grid gap-3">
                <ConsentRow label="Terms of Service" value={foundUser.tosAcceptedAt || foundUser.termsAcceptedAt} />
                <ConsentRow label="Privacy Policy" value={foundUser.privacyAcceptedAt} />
                <ConsentRow label="Fecha de registro" value={foundUser.createdAt} />
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-blue-950">Right to Access</h2>
              <p className="mt-2 text-sm leading-6 text-blue-900">
                Genera un JSON descargable con la información básica del documento del usuario.
              </p>
              <button
                type="button"
                disabled={Boolean(actionLoading)}
                className="mt-5 w-full rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                onClick={() => void handleExport()}
              >
                {actionLoading === 'export' ? 'Exportando...' : 'Exportar Datos del Usuario'}
              </button>
            </section>

            <section className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-red-700">Right to be Forgotten</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Anonimiza el usuario y crea un registro obligatorio en `legal_audit_logs`.
              </p>
              <button
                type="button"
                disabled={Boolean(actionLoading)}
                className="mt-5 w-full rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white hover:bg-red-800 disabled:opacity-60"
                onClick={() => setDeleteModalOpen(true)}
              >
                Ejecutar Eliminación Legal (GDPR/CCPA)
              </button>
            </section>
          </aside>
        </section>
      )}

      {deleteModalOpen && foundUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-red-200 bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-600">Confirmación legal estricta</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Ejecutar eliminación legal</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Esta acción anonimiza el documento `users/{foundUser.uid}` y registra la acción en
              `legal_audit_logs`. Para continuar escribe <strong>ELIMINAR</strong>.
            </p>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-slate-700">Email solicitante</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100"
                value={requestedByEmail}
                onChange={(event) => setRequestedByEmail(event.target.value)}
                placeholder="email del titular o solicitante"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Confirmación</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder="ELIMINAR"
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirmation('');
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteConfirmation !== 'ELIMINAR' || Boolean(actionLoading)}
                className="rounded-xl bg-red-700 px-4 py-2 text-sm font-black text-white hover:bg-red-800 disabled:opacity-40"
                onClick={() => void handleDeletion()}
              >
                {actionLoading === 'delete' ? 'Ejecutando...' : 'Confirmar eliminación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
