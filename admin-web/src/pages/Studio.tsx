import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  type FontTier,
  type StudioFont,
  getStudioFonts,
  uploadStudioFont,
} from '../services/studioService';

type Toast = { type: 'success' | 'error'; message: string };

function tierLabel(tier: FontTier) {
  return tier === 'premium' ? 'Premium' : 'Gratis';
}

function tierStyles(tier: FontTier) {
  return tier === 'premium'
    ? 'bg-amber-100 text-amber-900'
    : 'bg-emerald-100 text-emerald-800';
}

function formatDate(value: StudioFont['createdAt']) {
  if (!value) return 'Pendiente';
  const date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate() : null;
  if (!date) return 'Pendiente';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function Studio() {
  const { user } = useAuth();
  const [fonts, setFonts] = useState<StudioFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [tier, setTier] = useState<FontTier>('free');

  async function refreshFonts() {
    try {
      setLoading(true);
      const list = await getStudioFonts();
      setFonts(list);
    } catch (error) {
      console.error('[Studio] Failed to load fonts:', error);
      setToast({ type: 'error', message: 'No se pudieron cargar las fuentes.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const list = await getStudioFonts();
        if (isMounted) setFonts(list);
      } catch (error) {
        console.error('[Studio] Failed to load fonts:', error);
        if (isMounted) {
          setToast({ type: 'error', message: 'No se pudieron cargar las fuentes.' });
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
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);

    if (file && !displayName.trim()) {
      setDisplayName(file.name.replace(/\.(ttf|otf)$/i, ''));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      setToast({ type: 'error', message: 'Selecciona un archivo .ttf o .otf.' });
      return;
    }

    if (!displayName.trim()) {
      setToast({ type: 'error', message: 'El nombre visible es obligatorio.' });
      return;
    }

    setUploading(true);
    setToast(null);

    try {
      await uploadStudioFont({
        file: selectedFile,
        displayName: displayName.trim(),
        tier,
        createdBy: user?.uid,
        createdByEmail: user?.email,
      });

      setSelectedFile(null);
      setDisplayName('');
      setTier('free');
      await refreshFonts();
      setToast({ type: 'success', message: 'Fuente subida y publicada en font_library.' });
    } catch (error) {
      console.error('[Studio] Upload failed:', error);
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo subir la fuente.',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600">
          Studio &amp; Marketplace
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Fábrica de Assets</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Primer bloque monetizable del Studio: carga tipografías desde desktop, clasifícalas como
          Gratis o Premium, y publícalas en{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">font_library</code>.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <form
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={handleSubmit}
        >
          <h2 className="text-xl font-semibold text-slate-950">Subir nueva fuente</h2>
          <p className="mt-1 text-sm text-slate-500">
            Acepta archivos <strong>.ttf</strong> y <strong>.otf</strong>. Se guardan en{' '}
            <code className="text-xs">fonts/{tier}/timestamp-name</code>.
          </p>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-slate-700">Archivo de fuente</span>
            <input
              type="file"
              accept=".ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-otf"
              className="mt-1.5 w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700 outline-none file:mr-4 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:bg-slate-100"
              onChange={handleFileChange}
            />
            {selectedFile && (
              <span className="mt-2 block text-xs text-slate-500">
                Seleccionado: {selectedFile.name}
              </span>
            )}
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Nombre visible</span>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ej. Luxe Serif"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Nivel</span>
            <select
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
              value={tier}
              onChange={(event) => setTier(event.target.value as FontTier)}
            >
              <option value="free">Gratis</option>
              <option value="premium">Premium</option>
            </select>
          </label>

          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
            <div className="font-semibold">Ruta final</div>
            <div className="mt-1 font-mono text-xs">fonts/{tier}/{'{timestamp}'}-archivo</div>
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="mt-6 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-60"
          >
            {uploading ? 'Uploading...' : 'Subir Fuente'}
          </button>
        </form>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Fuentes publicadas</h2>
              <p className="mt-1 text-xs text-slate-500">
                Catálogo activo para Card Studio y futuras compras premium.
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void refreshFonts()}
            >
              Refrescar
            </button>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">Cargando fuentes...</div>
          ) : fonts.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">
              No hay fuentes todavía. Sube la primera desde el formulario.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Nombre</th>
                    <th className="px-6 py-4 font-semibold">Nivel</th>
                    <th className="px-6 py-4 font-semibold">Family</th>
                    <th className="px-6 py-4 font-semibold">Creada</th>
                    <th className="px-6 py-4 font-semibold">Archivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fonts.map((font) => (
                    <tr key={font.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-950">{font.name}</div>
                        <div className="text-xs text-slate-500">{font.filePath || font.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={[
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                            tierStyles(font.tier),
                          ].join(' ')}
                        >
                          {tierLabel(font.tier)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          {font.family}
                        </code>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(font.createdAt)}</td>
                      <td className="px-6 py-4">
                        <a
                          className="text-sm font-semibold text-violet-700 hover:text-violet-900 hover:underline"
                          href={font.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver archivo
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
