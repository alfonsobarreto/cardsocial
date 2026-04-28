/**
 * Escaneo QR en imagen (solo browser, sin Expo) — alineado con `services/vaultImageQrScan`.
 */

import jsQR from 'jsqr';

const MAX_DECODE_EDGE = 1400;

function decodeImageToImageData(src: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const img = new window.Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
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

export async function scanQrFromImageUrlStudio(uri: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;

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

    let imageData = await decodeImageToImageData(blobUrl ?? trimmed);
    if (!imageData && blobUrl) {
      imageData = await decodeImageToImageData(trimmed);
    }
    if (!imageData) return null;
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    return code?.data?.trim() || null;
  } catch {
    return null;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

function normalizeUrlForOpen(trimmed: string): string {
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
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

export function presentQrPayloadStudioWeb(
  payload: string,
  t: (k: string) => string,
): void {
  const trimmed = payload.trim();
  if (!trimmed) return;

  if (payloadLooksLinkingOpenable(trimmed)) {
    const href = normalizeUrlForOpen(trimmed);
    const ok = window.confirm(`${t('qr.detectedTitle')}\n\n${trimmed}\n\n${t('qr.openConfirm')}`);
    if (ok) window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }

  void navigator.clipboard.writeText(trimmed).then(
    () => window.alert(t('qr.copied')),
    () => window.alert(`${t('qr.couldNotCopy')}\n\n${trimmed}`),
  );
}
