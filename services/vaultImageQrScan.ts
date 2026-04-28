import * as Clipboard from 'expo-clipboard';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';
import jsQR from 'jsqr';
import { Alert, Image, Linking, Platform } from 'react-native';
import { Buffer } from 'buffer';

/** Lado máximo al decodificar (memoria + velocidad); suficiente para leer QRs típicos. */
const MAX_DECODE_EDGE = 1400;

function jpegBitmapToRgba(raw: { width: number; height: number; data: Uint8Array }): Uint8ClampedArray {
  const { width, height, data } = raw;
  const pixels = width * height;
  const need = pixels * 4;
  if (data.length >= need && data.length % 4 === 0 && data.length / 4 === pixels) {
    return new Uint8ClampedArray(data.buffer, data.byteOffset, need);
  }
  const rgba = new Uint8ClampedArray(need);
  if (data.length === pixels * 3) {
    for (let i = 0; i < pixels; i++) {
      rgba[i * 4] = data[i * 3];
      rgba[i * 4 + 1] = data[i * 3 + 1];
      rgba[i * 4 + 2] = data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }
  if (data.length === pixels) {
    for (let i = 0; i < pixels; i++) {
      const g = data[i];
      rgba[i * 4] = g;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = g;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }
  throw new Error('unsupported_jpeg_bitmap');
}

function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err),
    );
  });
}

/**
 * React Native Web: canvas + jsQR (sin Buffer/jpeg-js). Intenta fetch+CORS+blob para no “ensuciar” el canvas.
 */
function decodeImageToImageDataWeb(src: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const img = new window.Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w < 1 || h < 1) {
          resolve(null);
          return;
        }
        if (w > MAX_DECODE_EDGE || h > MAX_DECODE_EDGE) {
          if (w >= h) {
            h = Math.round((h * MAX_DECODE_EDGE) / w);
            w = MAX_DECODE_EDGE;
          } else {
            w = Math.round((w * MAX_DECODE_EDGE) / h);
            h = MAX_DECODE_EDGE;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(ctx.getImageData(0, 0, w, h));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function scanQrFromImageUriWeb(uri: string): Promise<string | null> {
  if (typeof document === 'undefined') {
    return null;
  }
  const trimmed = uri.trim();
  if (!trimmed) {
    return null;
  }

  let blobUrl: string | undefined;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const res = await fetch(trimmed, { mode: 'cors', credentials: 'omit' });
        if (res.ok) {
          const blob = await res.blob();
          blobUrl = URL.createObjectURL(blob);
        }
      } catch {
        /* seguir con la URI original */
      }
    }

    let imageData = await decodeImageToImageDataWeb(blobUrl ?? trimmed);
    if (!imageData && blobUrl) {
      imageData = await decodeImageToImageDataWeb(trimmed);
    }
    if (!imageData) {
      return null;
    }
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    return code?.data?.trim() || null;
  } catch {
    return null;
  } finally {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  }
}

/**
 * Decodifica un QR en una imagen (JPEG/PNG/WebP vía re-encode de Expo) sin módulos nativos extra.
 * Devuelve el payload en texto o null.
 */
export async function scanQrFromImageUri(uri: string): Promise<string | null> {
  if (!uri?.trim()) {
    return null;
  }

  if (Platform.OS === 'web') {
    return scanQrFromImageUriWeb(uri);
  }

  const actions: ImageManipulator.Action[] = [];
  try {
    const { width, height } = await getImageDimensions(uri);
    if (width > 0 && height > 0) {
      if (width >= height && width > MAX_DECODE_EDGE) {
        actions.push({ resize: { width: MAX_DECODE_EDGE } });
      } else if (height > width && height > MAX_DECODE_EDGE) {
        actions.push({ resize: { height: MAX_DECODE_EDGE } });
      }
    }
  } catch {
    actions.push({ resize: { width: MAX_DECODE_EDGE } });
  }

  const manipulated = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!manipulated.base64) {
    return null;
  }

  const buf = Buffer.from(manipulated.base64, 'base64');
  let raw: { width: number; height: number; data: Uint8Array };
  try {
    raw = decodeJpeg(buf, { useTArray: true }) as { width: number; height: number; data: Uint8Array };
  } catch {
    return null;
  }

  let rgba: Uint8ClampedArray;
  try {
    rgba = jpegBitmapToRgba(raw);
  } catch {
    return null;
  }

  const code = jsQR(rgba, raw.width, raw.height, { inversionAttempts: 'attemptBoth' });
  const data = code?.data?.trim();
  return data || null;
}

function normalizeUrlForOpen(trimmed: string): string {
  if (/^www\./i.test(trimmed)) {
    return 'https://' + trimmed;
  }
  return trimmed;
}

function payloadLooksLinkingOpenable(trimmed: string): boolean {
  return (
    /^https?:\/\//i.test(trimmed) ||
    /^www\./i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    /^tel:/i.test(trimmed) ||
    /^sms:/i.test(trimmed) ||
    /^geo:/i.test(trimmed)
  );
}

/**
 * Alert nativo tras leer QR: abrir con Linking si aplica, o copiar si es texto/WiFi/vCard.
 */
export function presentDetectedQrAlert(
  payload: string,
  tr: (es: string, en: string) => string,
  onCopied?: () => void,
): void {
  const trimmed = payload.trim();
  if (!trimmed) {
    return;
  }

  const openable = payloadLooksLinkingOpenable(trimmed);

  const open = () => {
    const href = normalizeUrlForOpen(trimmed);
    void Linking.openURL(href).catch(() => {
      Alert.alert(tr('No se pudo abrir', 'Could not open'), trimmed);
    });
  };

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(trimmed);
      onCopied?.();
    } catch {
      Alert.alert(tr('No se pudo copiar', 'Could not copy'), trimmed);
    }
  };

  if (openable) {
    Alert.alert(tr('QR detectado', 'QR detected'), trimmed, [
      { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
      { text: tr('Abrir enlace', 'Open link'), onPress: open },
    ]);
    return;
  }

  Alert.alert(tr('QR detectado', 'QR detected'), trimmed, [
    { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
    { text: tr('Copiar', 'Copy'), onPress: () => void copy() },
  ]);
}

/** Misma lógica que `presentDetectedQrAlert`, con cadenas desde i18n (`qr_*` en locales). */
export function presentDetectedQrFromT(
  payload: string,
  t: (key: string) => string,
  onCopied?: () => void,
): void {
  const trimmed = payload.trim();
  if (!trimmed) {
    return;
  }

  const openable = payloadLooksLinkingOpenable(trimmed);

  const open = () => {
    const href = normalizeUrlForOpen(trimmed);
    void Linking.openURL(href).catch(() => {
      Alert.alert(t('qr_could_not_open'), trimmed);
    });
  };

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(trimmed);
      onCopied?.();
    } catch {
      Alert.alert(t('qr_could_not_copy'), trimmed);
    }
  };

  if (openable) {
    Alert.alert(t('qr_detected'), trimmed, [
      { text: t('qr_cancel'), style: 'cancel' },
      { text: t('qr_open_link'), onPress: open },
    ]);
    return;
  }

  Alert.alert(t('qr_detected'), trimmed, [
    { text: t('qr_cancel'), style: 'cancel' },
    { text: t('qr_copy'), onPress: () => void copy() },
  ]);
}
