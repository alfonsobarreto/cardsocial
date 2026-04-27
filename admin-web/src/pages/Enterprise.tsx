import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  type Organization,
  createOrganization,
  getOrganizations,
  setOrganizationActive,
} from '../services/enterpriseService';

type Toast = { type: 'success' | 'error'; message: string };

function formatDate(value: Organization['createdAt']) {
  if (!value) return 'Pendiente';
  const date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate() : null;
  if (!date) return 'Pendiente';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function Enterprise() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [allocatedSeats, setAllocatedSeats] = useState(50);

  const totals = useMemo(
    () => ({
      accounts: organizations.length,
      active: organizations.filter((org) => org.isActive).length,
      seats: organizations.reduce((sum, org) => sum + org.allocatedSeats, 0),
      used: organizations.reduce((sum, org) => sum + org.usedSeats, 0),
    }),
    [organizations],
  );

  async function refreshOrganizations() {
    try {
      setLoading(true);
      setOrganizations(await getOrganizations());
    } catch (error) {
      console.error('[Enterprise] Failed to load organizations:', error);
      setToast({ type: 'error', message: 'No se pudieron cargar las empresas.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshOrganizations();
  }, []);

  useEffect(() => {
    if (!toast || toast.type !== 'success') return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const openModal = () => {
    setName('');
    setOwnerEmail('');
    setAllocatedSeats(50);
    setModalOpen(true);
    setToast(null);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setToast(null);

    try {
      await createOrganization({ name, ownerEmail, allocatedSeats });
      await refreshOrganizations();
      setModalOpen(false);
      setToast({ type: 'success', message: 'Empresa registrada con joinCode listo.' });
    } catch (error) {
      console.error('[Enterprise] Create organization failed:', error);
      setToast({ type: 'error', message: 'No se pudo registrar la empresa.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (org: Organization, nextActive: boolean) => {
    setTogglingId(org.id);
    setToast(null);

    try {
      await setOrganizationActive(org.id, nextActive);
      setOrganizations((prev) =>
        prev.map((item) => (item.id === org.id ? { ...item, isActive: nextActive } : item)),
      );
      setToast({ type: 'success', message: nextActive ? 'Empresa reactivada.' : 'Empresa desactivada.' });
    } catch (error) {
      console.error('[Enterprise] Toggle organization failed:', error);
      setToast({ type: 'error', message: 'No se pudo actualizar el estado de la empresa.' });
    } finally {
      setTogglingId('');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-600">
              Enterprise / Team Management
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">B2B & Enterprise</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Gestiona clientes corporativos, licencias compradas y códigos de invitación para equipos.
            </p>
          </div>
          <button
            type="button"
            className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-800"
            onClick={openModal}
          >
            Registrar Nueva Empresa
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ['Empresas', totals.accounts],
          ['Activas', totals.active],
          ['Seats comprados', totals.seats],
          ['Seats usados', totals.used],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
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

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Clientes corporativos</h2>
          <button
            type="button"
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => void refreshOrganizations()}
          >
            Refrescar
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">Cargando empresas...</div>
        ) : organizations.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">No hay empresas registradas todavía.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Nombre</th>
                  <th className="px-6 py-4 font-semibold">Gerente</th>
                  <th className="px-6 py-4 font-semibold">Licencias</th>
                  <th className="px-6 py-4 font-semibold">Código Invitación</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {organizations.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{org.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDate(org.createdAt)}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{org.ownerEmail}</td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-950">{org.usedSeats}</span>
                      <span className="text-slate-400"> / </span>
                      <span>{org.allocatedSeats}</span>
                    </td>
                    <td className="px-6 py-4">
                      <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">
                        {org.joinCode}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={[
                          'rounded-full px-2.5 py-1 text-xs font-semibold',
                          org.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800',
                        ].join(' ')}
                      >
                        {org.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        disabled={togglingId === org.id}
                        className={[
                          'rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-50',
                          org.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700',
                        ].join(' ')}
                        onClick={() => void handleToggle(org, !org.isActive)}
                      >
                        {org.isActive ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <form className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onSubmit={handleCreate}>
            <h2 className="text-xl font-semibold text-slate-950">Registrar Nueva Empresa</h2>
            <p className="mt-1 text-sm text-slate-500">
              Crea una organización con cupo de seats y código único para empleados.
            </p>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-slate-700">Nombre de la Empresa</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Acme Corp"
                required
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Email del Dueño / Gerente</span>
              <input
                type="email"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                placeholder="manager@empresa.com"
                required
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Cantidad de Licencias (Seats)</span>
              <input
                type="number"
                min={1}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                value={allocatedSeats}
                onChange={(event) => setAllocatedSeats(Number.parseInt(event.target.value, 10) || 1)}
                required
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? 'Registrando...' : 'Guardar empresa'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
