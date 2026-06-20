'use client';

import { useCallback, useMemo, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { getCroppedImageFile, type CropFlip } from '@/lib/cropImageExport';
import type { BasicPhotoEditorMode } from '@/lib/photoEditorPresets';
import { presetToEditorMode, type PhotoEditorPreset } from '@/lib/photoEditorPresets';
import { studioGradients, studioTheme } from '@/lib/studioTheme';
import type { StudioLocale } from '@/lib/studioI18n';
import { studioT } from '@/lib/studioI18n';

export type PhotoEditorModalProps = {
  locale: StudioLocale;
  objectUrl: string;
  fileName: string;
  preset: PhotoEditorPreset;
  onConfirm: (file: File) => void | Promise<void>;
  onChooseAgain: () => void;
  onClose: () => void;
};

function cropShapeForMode(mode: BasicPhotoEditorMode): 'rect' | 'round' {
  return mode.cropShape === 'circle' ? 'round' : 'rect';
}

function aspectForMode(mode: BasicPhotoEditorMode): number | undefined {
  if (mode.cropShape === 'square' || mode.cropShape === 'circle') return 1;
  return undefined;
}

export default function PhotoEditorModal({
  locale,
  objectUrl,
  fileName,
  preset,
  onConfirm,
  onChooseAgain,
  onClose,
}: PhotoEditorModalProps) {
  const t = useCallback((key: string) => studioT(locale, key), [locale]);
  const mode = useMemo(() => presetToEditorMode(preset), [preset]);
  const isReview = mode.cropShape === 'none';

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState<CropFlip>({ horizontal: false, vertical: false });
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      if (isReview) {
        const res = await fetch(objectUrl);
        const blob = await res.blob();
        await onConfirm(new File([blob], fileName, { type: blob.type || 'image/jpeg', lastModified: Date.now() }));
        return;
      }
      if (!croppedAreaPixels) return;
      const file = await getCroppedImageFile(
        objectUrl,
        croppedAreaPixels,
        rotation,
        flip,
        fileName,
        mode.cropShape === 'square' || mode.cropShape === 'circle' ? mode.outputSize ?? 512 : undefined,
        mode.cropShape === 'rect' ? mode.outputMaxLongEdge ?? 2000 : undefined,
      );
      await onConfirm(file);
    } finally {
      setBusy(false);
    }
  };

  const title = isReview ? t('photoEditor.reviewTitle') : t('photoEditor.cropTitle');
  const hint = isReview ? t('photoEditor.reviewHint') : t('photoEditor.cropHint');
  const confirmLabel = isReview ? t('photoEditor.usePhoto') : t('photoEditor.cropConfirm');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          maxHeight: '94vh',
          background: studioTheme.bg,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          overflow: 'hidden',
          border: `1px solid ${studioTheme.border}`,
        }}
      >
        <div style={{ position: 'relative', background: studioTheme.surface, minHeight: isReview ? 280 : 360 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('form.close')}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 2,
              width: 36,
              height: 36,
              borderRadius: 18,
              border: `1px solid ${studioTheme.border}`,
              background: studioTheme.surfaceElevated,
              color: studioTheme.text,
              cursor: 'pointer',
            }}
          >
            ×
          </button>

          {!isReview ? (
            <>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  justifyContent: 'center',
                  padding: '48px 12px 8px',
                }}
              >
                {[
                  { key: 'left', label: t('photoEditor.rotateLeft'), action: () => setRotation((r) => r - 90) },
                  { key: 'right', label: t('photoEditor.rotateRight'), action: () => setRotation((r) => r + 90) },
                  { key: 'h', label: t('photoEditor.mirrorH'), action: () => setFlip((f) => ({ ...f, horizontal: !f.horizontal })) },
                  { key: 'v', label: t('photoEditor.mirrorV'), action: () => setFlip((f) => ({ ...f, vertical: !f.vertical })) },
                ].map((tool) => (
                  <button
                    key={tool.key}
                    type="button"
                    onClick={tool.action}
                    disabled={busy}
                    style={{
                      border: `1px solid ${studioTheme.border}`,
                      background: studioTheme.surfaceElevated,
                      color: studioTheme.goldLight,
                      borderRadius: 10,
                      padding: '8px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative', width: '100%', height: 320 }}>
                <Cropper
                  image={objectUrl}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={aspectForMode(mode)}
                  cropShape={cropShapeForMode(mode)}
                  showGrid={mode.cropShape === 'rect'}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  style={{
                    containerStyle: { background: studioTheme.surface },
                    cropAreaStyle: {
                      border: `2px solid ${studioTheme.gold}`,
                    },
                  }}
                />
              </div>
              <div style={{ padding: '8px 16px 12px' }}>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={{ width: '100%' }}
                  aria-label={t('photoEditor.zoom')}
                />
              </div>
            </>
          ) : (
            <div style={{ padding: '56px 16px 16px', display: 'flex', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={objectUrl}
                alt={title}
                style={{
                  maxWidth: '100%',
                  maxHeight: 320,
                  objectFit: 'contain',
                  borderRadius: 12,
                }}
              />
            </div>
          )}
        </div>

        <div
          style={{
            borderTop: `1px solid ${studioTheme.border}`,
            padding: '18px 20px 28px',
            background: studioTheme.surfaceElevated,
          }}
        >
          <h3 style={{ margin: 0, textAlign: 'center', color: studioTheme.text, fontSize: 16 }}>{title}</h3>
          <p style={{ margin: '6px 0 14px', textAlign: 'center', color: studioTheme.textMuted, fontSize: 12, lineHeight: 1.45 }}>
            {hint}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onChooseAgain}
              disabled={busy}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 12,
                border: `1px solid ${studioTheme.borderStrong}`,
                background: 'transparent',
                color: studioTheme.text,
                fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {t('photoEditor.chooseAgain')}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={busy}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 12,
                border: 'none',
                background: studioGradients.cta,
                color: studioTheme.fabText,
                fontWeight: 700,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? t('form.saving') : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
