/**
 * Límites técnicos para multimedia en Historias (Búnker: rápido, barato, sin 4K).
 */

/** API estable para tamaños en disco; el entry `expo-file-system` depreca getInfoAsync en SDK 54+. */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

/** Máximo ~5 MB tras compresión / redimensionado. */
export const STORY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Borde largo máximo (Full HD). */
export const STORY_IMAGE_MAX_EDGE = 1920;

/** Máximo ~25 MB. */
export const STORY_VIDEO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Duración máxima de video (galería / cámara). Alineado con el segmento del carrusel (~30 s).
 */
export const STORY_VIDEO_MAX_DURATION_SEC = 30;

/** Fotos, texto, anuncios: segmento del carrusel (~industria stories). */
export const STORY_PHOTO_EXPOSURE_MS = 7000;

/** Tope por si un video remoto no reportara duración (seguridad). */
export const STORY_VIDEO_EXPOSURE_CAP_MS = STORY_VIDEO_MAX_DURATION_SEC * 1000;

type LocalStoryExposure = {
  storyType?: 'image' | 'video' | 'text' | 'document';
  mediaDurationSec?: number;
} | null;

/** Duración en ms del segmento actual del visor de historias. */
export function computeStoryViewerExposureMs(item: { kind: string; localStory?: LocalStoryExposure } | null): number {
  if (!item) {
    return STORY_PHOTO_EXPOSURE_MS;
  }
  if (item.kind === 'ad' || item.kind === 'market_vip') {
    return STORY_PHOTO_EXPOSURE_MS;
  }
  if (item.kind !== 'story') {
    return STORY_PHOTO_EXPOSURE_MS;
  }
  const s = item.localStory;
  if (!s || s.storyType !== 'video') {
    return STORY_PHOTO_EXPOSURE_MS;
  }
  const sec = typeof s.mediaDurationSec === 'number' && Number.isFinite(s.mediaDurationSec) ? s.mediaDurationSec : null;
  if (sec == null || sec <= 0) {
    return STORY_PHOTO_EXPOSURE_MS;
  }
  const ms = Math.round(sec * 1000);
  return Math.min(STORY_VIDEO_EXPOSURE_CAP_MS, Math.max(STORY_PHOTO_EXPOSURE_MS, ms));
}

/**
 * expo-image-picker: `duration` suele venir en milisegundos en nativo; normaliza a segundos.
 */
export function videoDurationSecondsFromAsset(duration: number | null | undefined): number | null {
  if (duration == null || !Number.isFinite(duration)) {
    return null;
  }
  return duration > 3200 ? duration / 1000 : duration;
}

export async function normalizeStoryPickedImage(
  uri: string,
  width: number,
  height: number
): Promise<{ uri: string } | { error: string }> {
  const maxEdge = STORY_IMAGE_MAX_EDGE;
  const actions: ImageManipulator.Action[] = [];
  const w = Number(width) || 0;
  const h = Number(height) || 0;

  if (w > 0 && h > 0 && (w > maxEdge || h > maxEdge)) {
    if (w >= h) {
      actions.push({ resize: { width: maxEdge } });
    } else {
      actions.push({ resize: { height: maxEdge } });
    }
  }

  let outUri = uri;
  if (actions.length > 0) {
    const manipulated = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    outUri = manipulated.uri;
  } else {
    const manipulated = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    outUri = manipulated.uri;
  }

  let info = await FileSystem.getInfoAsync(outUri);
  let size = info.exists ? Number(info.size ?? 0) : 0;

  if (size > STORY_IMAGE_MAX_BYTES) {
    let q = 0.72;
    for (let step = 0; step < 5 && size > STORY_IMAGE_MAX_BYTES; step++) {
      const r = await ImageManipulator.manipulateAsync(outUri, [], {
        compress: q,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      outUri = r.uri;
      info = await FileSystem.getInfoAsync(outUri);
      size = info.exists ? Number(info.size ?? 0) : 0;
      q = Math.max(0.35, q - 0.1);
    }
  }

  if (size > STORY_IMAGE_MAX_BYTES) {
    return { error: 'IMAGE_TOO_LARGE' };
  }

  return { uri: outUri };
}

/** Si no hay dimensiones del picker, obtiene tamaño con RN Image.getSize. */
export async function normalizeStoryPickedImageAuto(uri: string): Promise<{ uri: string } | { error: string }> {
  const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (e) => reject(e)
    );
  }).catch(() => ({ width: 0, height: 0 }));
  return normalizeStoryPickedImage(uri, dims.width, dims.height);
}

export function validateStoryVideoAsset(
  asset: { duration?: number | null; fileSize?: number | null; uri: string },
  tr: (es: string, en: string) => string
): Promise<{ ok: true; durationSec: number } | { ok: false; message: string }> {
  return (async () => {
    const rawSec = videoDurationSecondsFromAsset(asset.duration ?? undefined);
    if (rawSec != null && rawSec > STORY_VIDEO_MAX_DURATION_SEC + 0.35) {
      return {
        ok: false,
        message: tr(
          `El video no puede durar más de ${STORY_VIDEO_MAX_DURATION_SEC} segundos.`,
          `Videos cannot be longer than ${STORY_VIDEO_MAX_DURATION_SEC} seconds.`,
        ),
      };
    }

    let size = asset.fileSize != null ? Number(asset.fileSize) : null;
    if (size == null) {
      const info = await FileSystem.getInfoAsync(asset.uri).catch(() => null);
      size = info?.exists && info.size != null ? Number(info.size) : null;
    }
    if (size != null && size > STORY_VIDEO_MAX_BYTES) {
      return {
        ok: false,
        message: tr(
          `El video supera ${Math.round(STORY_VIDEO_MAX_BYTES / (1024 * 1024))} MB. Elige uno más corto o ligero.`,
          `This video exceeds ${Math.round(STORY_VIDEO_MAX_BYTES / (1024 * 1024))} MB. Pick a shorter or smaller file.`,
        ),
      };
    }

    const durationSec = Math.min(
      STORY_VIDEO_MAX_DURATION_SEC,
      Math.max(0.5, rawSec ?? STORY_PHOTO_EXPOSURE_MS / 1000)
    );
    return { ok: true, durationSec };
  })();
}
