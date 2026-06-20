'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type ChangeEventHandler, type ReactNode } from 'react';
import type { PhotoEditorPreset } from '@/lib/photoEditorPresets';
import type { StudioLocale } from '@/lib/studioI18n';

const PhotoEditorModal = dynamic(() => import('@/components/studio/PhotoEditorModal'), { ssr: false });

type EditorDraft = {
  file: File;
  objectUrl: string;
};

export type UseStudioPhotoPickOptions = {
  locale: StudioLocale;
  preset: PhotoEditorPreset;
  onConfirm: (file: File) => void | Promise<void>;
  onChooseAgain?: () => void;
};

function isLikelyImageFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);
}

export function useStudioPhotoPick({ locale, preset, onConfirm, onChooseAgain }: UseStudioPhotoPickOptions) {
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const retryRef = useRef<() => void>(() => {});

  const closeEditor = useCallback(() => {
    setDraft((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (draft?.objectUrl) URL.revokeObjectURL(draft.objectUrl);
    };
  }, [draft?.objectUrl]);

  const openEditorWithFile = useCallback((file: File, retry: () => void) => {
    if (!isLikelyImageFile(file)) return false;
    retryRef.current = retry;
    const objectUrl = URL.createObjectURL(file);
    setDraft((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return { file, objectUrl };
    });
    return true;
  }, []);

  const openGalleryPicker = useCallback(() => {
    galleryInputRef.current?.click();
  }, []);

  const openCameraPicker = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const handleInputChange =
    (retry: () => void): ChangeEventHandler<HTMLInputElement> =>
    (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) openEditorWithFile(file, retry);
    };

  const handleRawFile = useCallback(
    (file: File | null | undefined, retry: () => void) => {
      if (!file) return false;
      return openEditorWithFile(file, retry);
    },
    [openEditorWithFile],
  );

  const hiddenInputs = (
    <>
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange(() => openGalleryPicker())}
        style={{ display: 'none' }}
      />
      {preset.allowCameraFront ? (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          onChange={handleInputChange(() => openCameraPicker())}
          style={{ display: 'none' }}
        />
      ) : null}
    </>
  );

  const editorNode: ReactNode = draft ? (
    <PhotoEditorModal
      locale={locale}
      objectUrl={draft.objectUrl}
      fileName={draft.file.name}
      preset={preset}
      onConfirm={async (file) => {
        closeEditor();
        await onConfirm(file);
      }}
      onChooseAgain={() => {
        closeEditor();
        onChooseAgain?.();
        window.setTimeout(() => retryRef.current(), 200);
      }}
      onClose={closeEditor}
    />
  ) : null;

  return {
    draft,
    isEditing: Boolean(draft),
    hiddenInputs,
    editorNode,
    openGalleryPicker,
    openCameraPicker,
    openEditorWithFile,
    handleRawFile,
    closeEditor,
  };
}
