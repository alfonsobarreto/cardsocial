const MB = 1024 * 1024;

export const STUDIO_PROFILE_PHOTO_MAX_BYTES = 2 * MB;
export const STUDIO_BACKEND_IMAGE_MAX_BYTES = 5 * MB;
export const STUDIO_DOCUMENT_MAX_BYTES = 20 * MB;

const SAFE_IMAGE_UPLOAD_MAX_BYTES = Math.floor(STUDIO_BACKEND_IMAGE_MAX_BYTES * 0.92);

export function isLikelyImage(file: File): boolean {
  if (file.type.toLowerCase().startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);
}

function isLikelyPdf(file: File): boolean {
  if (file.type.toLowerCase().includes('pdf')) return true;
  return /\.pdf$/i.test(file.name);
}

function jpgName(name: string): string {
  const base = String(name || 'image').replace(/\.[^/.]+$/, '') || 'image';
  return `${base}.jpg`;
}

function decodeImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not compress image.'));
        else resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

async function renderJpeg(file: File, maxLongEdge: number, quality: number): Promise<File> {
  const img = await decodeImage(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const longEdge = Math.max(srcW, srcH) || maxLongEdge;
  const scale = Math.min(1, maxLongEdge / longEdge);
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare image compression.');

  // JPEG has no alpha channel; white avoids black boxes for transparent PNGs.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);

  const blob = await canvasToBlob(canvas, quality);
  return new File([blob], jpgName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
}

async function compressImageToLimit(
  file: File,
  maxBytes: number,
  attempts: Array<{ edge: number; quality: number }>,
): Promise<File> {
  if (!isLikelyImage(file)) return file;
  if (file.size <= maxBytes && file.type.toLowerCase() === 'image/jpeg') return file;

  let best: File | null = null;
  for (const attempt of attempts) {
    const next = await renderJpeg(file, attempt.edge, attempt.quality);
    if (!best || next.size < best.size) best = next;
    if (next.size <= maxBytes) return next;
  }

  if (best && best.size <= maxBytes) return best;
  throw new Error(`Image is still too large after compression (${(((best?.size || file.size) / MB)).toFixed(2)} MB).`);
}

export async function optimizeProfilePhotoForWeb(file: File): Promise<File> {
  if (!isLikelyImage(file)) return file;
  return compressImageToLimit(file, STUDIO_PROFILE_PHOTO_MAX_BYTES, [
    { edge: 1920, quality: 0.72 },
    { edge: 1440, quality: 0.62 },
    { edge: 1080, quality: 0.52 },
    { edge: 840, quality: 0.45 },
    { edge: 640, quality: 0.38 },
    { edge: 480, quality: 0.2 },
  ]);
}

export async function optimizeVaultUploadFileForWeb(file: File): Promise<File> {
  if (isLikelyPdf(file)) {
    if (file.size > STUDIO_DOCUMENT_MAX_BYTES) {
      throw new Error('PDF exceeds 20MB limit. Choose a lighter PDF.');
    }
    return file;
  }

  if (!isLikelyImage(file)) return file;
  return compressImageToLimit(file, SAFE_IMAGE_UPLOAD_MAX_BYTES, [
    { edge: 2000, quality: 0.8 },
    { edge: 2000, quality: 0.72 },
    { edge: 1700, quality: 0.65 },
    { edge: 1440, quality: 0.58 },
    { edge: 1220, quality: 0.5 },
    { edge: 1040, quality: 0.44 },
    { edge: 880, quality: 0.38 },
    { edge: 720, quality: 0.34 },
  ]);
}
