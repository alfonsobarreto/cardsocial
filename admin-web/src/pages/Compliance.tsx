import { type FormEvent, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  type ComplianceUser,
  type LegalConsentEvent,
  downloadUserDataJson,
  executeLegalDeletion,
  findComplianceUser,
  getUserExportData,
  listLegalConsentEvents,
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

function ConsentMetaRow({
  label,
  valueText,
}: {
  label: string;
  valueText: string;
}) {
  const has = Boolean(valueText && valueText !== 'No registrado');
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs font-mono text-slate-600">{valueText}</p>
      </div>
      <span
        className={[
          'rounded-full px-2.5 py-1 text-xs font-semibold',
          has ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800',
        ].join(' ')}
      >
        {has ? 'Auditado' : 'Pendiente'}
      </span>
    </div>
  );
}

function LegalConsentEventRow({ event }: { event: LegalConsentEvent }) {
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const docs = event.acceptedDocuments
    ? Object.entries(event.acceptedDocuments)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
        .join(', ')
    : 'No registrado';

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-950">{event.eventType}</p>
          <p className="mt-1 text-xs text-emerald-800">{formatDate(event.acceptedAt || event.createdAt)}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
          Append-only
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-emerald-900 md:grid-cols-2">
        <p>
          <strong>Versión:</strong> {event.legalConsentBundleVersion || 'No registrado'}
        </p>
        <p>
          <strong>Idioma:</strong> {event.locale || event.appLanguage || 'No registrado'}
        </p>
        <p>
          <strong>Plataforma:</strong> {event.platform || 'No registrado'}
        </p>
        <p>
          <strong>Fuente:</strong> {event.source || 'No registrado'}
        </p>
        <p className="md:col-span-2">
          <strong>Documentos:</strong> {docs}
        </p>
        <p className="break-all font-mono text-[11px] text-emerald-700 md:col-span-2">
          users/{event.uid}/legalConsentEvents/{event.id}
        </p>
      </div>
      <div className="mt-3 rounded-2xl border border-white/80 bg-white/80 p-3">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Hashes legales</p>
        <div className="mt-2 grid gap-1 text-[11px] text-emerald-950">
          <p>
            <strong>Algoritmo:</strong> {event.hashAlgorithm || 'No registrado'} ·{' '}
            <strong>Canonicalización:</strong> {event.canonicalization || 'No registrado'}
          </p>
          <p className="break-all font-mono">
            <strong>Bundle:</strong> {event.bundleHash || 'No registrado'}
          </p>
          <p className="break-all font-mono">
            <strong>Términos:</strong> {event.termsHash || 'No registrado'}
          </p>
          <p className="break-all font-mono">
            <strong>Privacidad:</strong> {event.privacyHash || 'No registrado'}
          </p>
          <p className="break-all font-mono">
            <strong>Uso:</strong> {event.usageHash || 'No registrado'}
          </p>
        </div>
        {event.legalTextSnapshot && (
          <div className="mt-3">
            <button
              type="button"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
              onClick={() => setSnapshotOpen((value) => !value)}
            >
              {snapshotOpen ? 'Ocultar texto legal aceptado' : 'Ver texto legal aceptado'}
            </button>
            {snapshotOpen && (
              <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                {JSON.stringify(event.legalTextSnapshot, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Compliance() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [foundUser, setFoundUser] = useState<ComplianceUser | null>(null);
  const [legalConsentEvents, setLegalConsentEvents] = useState<LegalConsentEvent[]>([]);
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
    setLegalConsentEvents([]);

    try {
      const result = await findComplianceUser(search);
      if (!result) {
        setToast({
          type: 'error',
          message:
            'No se encontró un usuario con ese correo, UID o nombre de usuario. Prueba también sin @.',
        });
        return;
      }
      setFoundUser(result);
      setRequestedByEmail(result.email);
      setLegalConsentEvents(await listLegalConsentEvents(result.uid));
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
      setLegalConsentEvents(await listLegalConsentEvents(foundUser.uid));
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
            placeholder="Correo, UID de Firebase o usuario (nick)"
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

              <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Usuario (nick)</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {foundUser.nickname || 'No registrado'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Teléfono</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{foundUser.phoneNumber || 'No registrado'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Registro cuenta</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(foundUser.createdAt)}</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950">Consentimientos (registro)</h2>
              <p className="mt-2 text-xs text-slate-500">
                Trazabilidad para moderación/bloqueos: marca de tiempo de aceptación y versión del paquete legal
                registrada en alta.
              </p>
              <div className="mt-5 grid gap-3">
                <ConsentRow label="Terms of Service" value={foundUser.tosAcceptedAt || foundUser.termsAcceptedAt} />
                <ConsentRow label="Privacy Policy" value={foundUser.privacyAcceptedAt} />
                <ConsentRow label="Política de uso / moderación" value={foundUser.acceptableUseAcceptedAt} />
                <ConsentMetaRow
                  label="Versión legal aceptada (bundle)"
                  valueText={foundUser.legalConsentBundleVersion || 'No registrado'}
                />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950">Histórico legal append-only</h2>
              <p className="mt-2 text-xs text-slate-500">
                Eventos inmutables guardados en `users/{foundUser.uid}/legalConsentEvents`. Estos eventos no se editan
                ni se borran desde reglas de Firestore.
              </p>
              <div className="mt-5 grid gap-3">
                {legalConsentEvents.length > 0 ? (
                  legalConsentEvents.map((event) => <LegalConsentEventRow key={event.id} event={event} />)
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    No hay eventos append-only para este usuario. Si es una cuenta creada antes de esta implementación,
                    usa los campos superiores como registro legacy.
                  </div>
                )}
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
