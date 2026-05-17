import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';

import { useAuth } from '../auth/useAuth';
import { useAdminT } from '../i18n/useAdminT';
import { deleteAdminMedia, uploadAdminMedia } from '../services/mediaUploadService';

type SessionItem = {
  id: string;
  url: string;
  filename: string;
  thumbUrl: string;
};

const ACCEPT = 'image/png,image/jpeg';

function isAllowedImageFile(file: File | null): boolean {
  if (!file) return false;
  const t = (file.type || '').toLowerCase();
  return t === 'image/png' || t === 'image/jpeg';
}

export default function MediaManager() {
  const { user } = useAuth();
  const { t } = useAdminT();
  const [items, setItems] = useState<SessionItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pushNotice = useCallback((type: 'ok' | 'err', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      if (!user) return;
      if (!isAllowedImageFile(file)) {
        pushNotice('err', t('admin_media_err_type'));
        return;
      }
      setUploading(true);
      try {
        const result = await uploadAdminMedia(user, file);
        const id =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        setItems((prev) => [
          {
            id,
            url: result.url,
            filename: result.filename,
            thumbUrl: result.url,
          },
          ...prev,
        ]);
      } catch (e) {
        console.error('[MediaManager]', e);
        pushNotice('err', t('admin_media_err_network'));
      } finally {
        setUploading(false);
      }
    },
    [user, t, pushNotice],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void processFile(f);
    },
    [processFile],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      const list = e.clipboardData?.items;
      if (!list?.length) return;
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        if (it.kind !== 'file') continue;
        const file = it.getAsFile();
        if (!file) continue;
        if (!isAllowedImageFile(file)) continue;
        e.preventDefault();
        void processFile(file);
        return;
      }
    },
    [processFile],
  );

  useEffect(() => {
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPaste]);

  const dropZoneClass = useMemo(
    () =>
      [
        'rounded-2xl border-2 border-dashed px-6 py-14 text-center transition',
        dragOver ? 'border-amber-500 bg-amber-50' : 'border-slate-300 bg-white hover:border-slate-400',
        uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer',
      ].join(' '),
    [dragOver, uploading],
  );

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      pushNotice('ok', t('admin_media_copied'));
    } catch {
      pushNotice('err', t('admin_media_clipboard_denied'));
    }
  };

  const removeFromSession = useCallback(
    async (item: SessionItem) => {
      if (!user) return;
      setRemovingId(item.id);
      try {
        await deleteAdminMedia(user, item.filename);
        setItems((prev) => prev.filter((x) => x.id !== item.id));
        pushNotice('ok', t('admin_media_deleted'));
      } catch (e) {
        console.error('[MediaManager] delete', e);
        pushNotice('err', t('admin_media_delete_fail'));
      } finally {
        setRemovingId(null);
      }
    },
    [user, t, pushNotice],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t('admin_media_title')}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('admin_media_subtitle')}</p>
      </div>

      {notice ? (
        <div
          className={
            notice.type === 'ok'
              ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          {notice.text}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void processFile(f);
          e.target.value = '';
        }}
      />

      <div
        role="button"
        tabIndex={0}
        className={dropZoneClass}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <p className="text-sm font-medium text-slate-700">{t('admin_media_uploading')}</p>
          </div>
        ) : (
          <>
            <p className="text-base font-semibold text-slate-800">{t('admin_media_drop_hint')}</p>
            <p className="mt-2 text-sm text-amber-700 underline-offset-2 hover:underline">
              {t('admin_media_click_choose')}
            </p>
            <p className="mt-4 text-xs text-slate-500">{t('admin_media_paste_hint')}</p>
          </>
        )}
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('admin_media_session_grid')}</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">{t('admin_media_empty_session')}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <li
                key={it.id}
                className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="relative aspect-video bg-slate-100">
                  <button
                    type="button"
                    className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/75 text-lg font-light leading-none text-white shadow-md transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                    aria-label={t('admin_media_remove')}
                    title={t('admin_media_remove')}
                    disabled={uploading || removingId === it.id}
                    onClick={() => void removeFromSession(it)}
                  >
                    ×
                  </button>
                  <img
                    src={it.thumbUrl}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="space-y-2 p-3">
                  <p className="truncate text-xs text-slate-600" title={it.filename}>
                    {it.filename}
                  </p>
                  <button
                    type="button"
                    className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 shadow hover:bg-amber-300 disabled:opacity-50"
                    disabled={uploading}
                    onClick={() => void copyUrl(it.url)}
                  >
                    {t('admin_media_copy_url')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
