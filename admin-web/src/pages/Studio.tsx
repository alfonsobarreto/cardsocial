import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  type AssetStatus,
  type AssetTier,
  type AssetType,
  type StudioAsset,
  type StudioFont,
  type StudioVisualAsset,
  getStudioFonts,
  getStudioIcons,
  getStudioWallpapers,
  uploadStudioFont,
  uploadStudioIcon,
  uploadStudioWallpaper,
} from '../services/studioService';

type Toast = { type: 'success' | 'error'; message: string };
type StudioTab = AssetType;

const TABS: { key: StudioTab; label: string; description: string }[] = [
  { key: 'font', label: 'Tipografías', description: 'Fuentes .ttf/.otf para Card Studio' },
  { key: 'icon', label: 'Iconos', description: 'Inventario visual .png/.jpg/.svg' },
  { key: 'wallpaper', label: 'Wallpapers', description: 'Fondos premium y gratis' },
];

function tierLabel(tier: AssetTier) {
  return tier === 'premium' ? 'Premium' : 'Gratis';
}

function tierStyles(tier: AssetTier) {
  return tier === 'premium'
    ? 'bg-amber-100 text-amber-900'
    : 'bg-emerald-100 text-emerald-800';
}

function statusLabel(status: AssetStatus) {
  return status === 'published' ? 'Publicado' : 'Borrador';
}

function statusStyles(status: AssetStatus) {
  return status === 'published'
    ? 'bg-blue-100 text-blue-800'
    : 'bg-slate-100 text-slate-700';
}

function formatDate(value: StudioAsset['createdAt']) {
  if (!value) return 'Pendiente';
  const date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate() : null;
  if (!date) return 'Pendiente';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function isVisualAsset(asset: StudioAsset): asset is StudioVisualAsset {
  return asset.type === 'icon' || asset.type === 'wallpaper';
}

export default function Studio() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<StudioTab>('font');
  const [fonts, setFonts] = useState<StudioFont[]>([]);
  const [icons, setIcons] = useState<StudioVisualAsset[]>([]);
  const [wallpapers, setWallpapers] = useState<StudioVisualAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [tier, setTier] = useState<AssetTier>('free');
  const [priceCoins, setPriceCoins] = useState(0);
  const [status, setStatus] = useState<AssetStatus>('draft');

  const activeAssets = useMemo<StudioAsset[]>(() => {
    if (activeTab === 'icon') return icons;
    if (activeTab === 'wallpaper') return wallpapers;
    return fonts;
  }, [activeTab, fonts, icons, wallpapers]);

  const activeTabConfig = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];
  const isFontTab = activeTab === 'font';
  const storagePath = isFontTab ? `fonts/${tier}` : `${activeTab}s/${tier}`;
  const fileAccept = isFontTab
    ? '.ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-otf'
    : '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml';

  async function refreshAssets(tab: StudioTab = activeTab) {
    try {
      setLoading(true);
      if (tab === 'font') {
        setFonts(await getStudioFonts());
      } else if (tab === 'icon') {
        setIcons(await getStudioIcons());
      } else {
        setWallpapers(await getStudioWallpapers());
      }
    } catch (error) {
      console.error('[Studio] Failed to load assets:', error);
      setToast({ type: 'error', message: 'No se pudo cargar el inventario del Studio.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const [fontList, iconList, wallpaperList] = await Promise.all([
          getStudioFonts(),
          getStudioIcons(),
          getStudioWallpapers(),
        ]);

        if (isMounted) {
          setFonts(fontList);
          setIcons(iconList);
          setWallpapers(wallpaperList);
        }
      } catch (error) {
        console.error('[Studio] Failed to load assets:', error);
        if (isMounted) {
          setToast({ type: 'error', message: 'No se pudo cargar el inventario del Studio.' });
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

  useEffect(() => {
    setSelectedFile(null);
    setDisplayName('');
    setTier('free');
    setPriceCoins(0);
    setStatus('draft');
  }, [activeTab]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);

    if (file && !displayName.trim()) {
      setDisplayName(file.name.replace(/\.[^/.]+$/i, ''));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      setToast({ type: 'error', message: 'Selecciona un archivo antes de subir.' });
      return;
    }

    if (!displayName.trim()) {
      setToast({ type: 'error', message: 'El nombre visible es obligatorio.' });
      return;
    }

    setUploading(true);
    setToast(null);

    try {
      const commonInput = {
        file: selectedFile,
        displayName: displayName.trim(),
        tier,
        createdBy: user?.uid,
        createdByEmail: user?.email,
      };

      if (activeTab === 'font') {
        await uploadStudioFont(commonInput);
      } else if (activeTab === 'icon') {
        await uploadStudioIcon({ ...commonInput, priceCoins, status });
      } else {
        await uploadStudioWallpaper({ ...commonInput, priceCoins, status });
      }

      setSelectedFile(null);
      setDisplayName('');
      setTier('free');
      setPriceCoins(0);
      setStatus('draft');
      await refreshAssets(activeTab);
      setToast({ type: 'success', message: `${activeTabConfig.label} publicado en el inventario.` });
    } catch (error) {
      console.error('[Studio] Upload failed:', error);
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo subir el asset.',
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
          Gestiona el inventario visual monetizable de Card-Social: tipografías, iconos y wallpapers
          con pricing en CS Coins y estado editorial.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                'rounded-2xl px-5 py-4 text-left transition',
                activeTab === tab.key
                  ? 'bg-slate-950 text-white shadow-lg'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              <div className="font-semibold">{tab.label}</div>
              <div className={activeTab === tab.key ? 'mt-1 text-xs text-slate-300' : 'mt-1 text-xs text-slate-500'}>
                {tab.description}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <form
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={handleSubmit}
        >
          <h2 className="text-xl font-semibold text-slate-950">
            Subir {activeTabConfig.label.toLowerCase()}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Ruta: <code className="text-xs">{storagePath}/timestamp-name</code>
          </p>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-slate-700">Archivo</span>
            <input
              type="file"
              accept={fileAccept}
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
              placeholder={isFontTab ? 'Ej. Luxe Serif' : 'Ej. Neon Gold Pack'}
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Nivel</span>
            <select
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
              value={tier}
              onChange={(event) => {
                const nextTier = event.target.value as AssetTier;
                setTier(nextTier);
                if (nextTier === 'free') setPriceCoins(0);
              }}
            >
              <option value="free">Gratis</option>
              <option value="premium">Premium</option>
            </select>
          </label>

          {!isFontTab && (
            <>
              <label className="mt-4 block">
                <span className="text-sm font-medium text-slate-700">Precio en CS Coins</span>
                <input
                  type="number"
                  min={0}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  value={priceCoins}
                  onChange={(event) => setPriceCoins(Number.parseInt(event.target.value, 10) || 0)}
                />
                <span className="mt-1 block text-xs text-slate-500">Usa 0 si el asset es gratis.</span>
              </label>

              <label className="mt-4 block">
                <span className="text-sm font-medium text-slate-700">Estado</span>
                <select
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as AssetStatus)}
                >
                  <option value="draft">Borrador</option>
                  <option value="published">Publicado</option>
                </select>
              </label>
            </>
          )}

          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
            <div className="font-semibold">Inventario objetivo</div>
            <div className="mt-1 font-mono text-xs">
              {activeTab === 'font'
                ? 'font_library'
                : activeTab === 'icon'
                  ? 'icon_library'
                  : 'wallpaper_library'}
            </div>
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="mt-6 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-60"
          >
            {uploading ? 'Uploading...' : `Subir ${activeTabConfig.label}`}
          </button>
        </form>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{activeTabConfig.label} publicados</h2>
              <p className="mt-1 text-xs text-slate-500">
                Inventario actual para marketplace y personalización.
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void refreshAssets(activeTab)}
            >
              Refrescar
            </button>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">Cargando assets...</div>
          ) : activeAssets.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">
              No hay assets en esta pestaña todavía.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Asset</th>
                    <th className="px-6 py-4 font-semibold">Nivel</th>
                    {!isFontTab && <th className="px-6 py-4 font-semibold">Precio</th>}
                    {!isFontTab && <th className="px-6 py-4 font-semibold">Estado</th>}
                    {isFontTab && <th className="px-6 py-4 font-semibold">Family</th>}
                    <th className="px-6 py-4 font-semibold">Creado</th>
                    <th className="px-6 py-4 font-semibold">Archivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeAssets.map((asset) => (
                    <tr key={`${asset.type}-${asset.id}`} className="hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {isVisualAsset(asset) && (
                            <img
                              src={asset.thumbnailUrl}
                              alt={asset.name}
                              className="h-12 w-12 rounded-xl border border-slate-200 object-cover"
                            />
                          )}
                          <div>
                            <div className="font-semibold text-slate-950">{asset.name}</div>
                            <div className="max-w-[260px] truncate text-xs text-slate-500">
                              {asset.filePath || asset.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={[
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                            tierStyles(asset.tier),
                          ].join(' ')}
                        >
                          {tierLabel(asset.tier)}
                        </span>
                      </td>
                      {isVisualAsset(asset) && (
                        <td className="px-6 py-4 text-slate-700">
                          {asset.priceCoins.toLocaleString()} CS
                        </td>
                      )}
                      {isVisualAsset(asset) && (
                        <td className="px-6 py-4">
                          <span
                            className={[
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                              statusStyles(asset.status),
                            ].join(' ')}
                          >
                            {statusLabel(asset.status)}
                          </span>
                        </td>
                      )}
                      {!isVisualAsset(asset) && (
                        <td className="px-6 py-4">
                          <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {asset.family}
                          </code>
                        </td>
                      )}
                      <td className="px-6 py-4 text-slate-600">{formatDate(asset.createdAt)}</td>
                      <td className="px-6 py-4">
                        <a
                          className="text-sm font-semibold text-violet-700 hover:text-violet-900 hover:underline"
                          href={asset.fileUrl}
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
