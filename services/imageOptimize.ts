import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

export async function getImageFileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true } as FileSystem.InfoOptions);
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      return info.size;
    }
  } catch {
    /* fallback */
  }
  const blob = await fetch(uri).then((r) => r.blob());
  return blob.size;
}

export async function resolveImageDimensions(
  uri: string,
  widthHint?: number,
  heightHint?: number,
): Promise<{ width: number; height: number }> {
  const w = Number(widthHint || 0);
  const h = Number(heightHint || 0);
  if (w > 0 && h > 0) {
    return { width: Math.round(w), height: Math.round(h) };
  }
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      reject,
    );
  });
}

export type OptimizePhotoOptions = {
  maxBytes: number;
  attempts?: Array<{ width: number; compress: number }>;
  emergency?: { width: number; compress: number };
};

const DEFAULT_ATTEMPTS: OptimizePhotoOptions['attempts'] = [
  { width: 1920, compress: 0.72 },
  { width: 1440, compress: 0.62 },
  { width: 1080, compress: 0.52 },
  { width: 840, compress: 0.45 },
  { width: 640, compress: 0.38 },
];

export async function optimizePhotoToMaxBytes(
  uri: string,
  options: OptimizePhotoOptions,
): Promise<string> {
  const initialSize = await getImageFileSize(uri);
  if (initialSize <= options.maxBytes) {
    return uri;
  }

  const attempts = options.attempts ?? DEFAULT_ATTEMPTS!;
  let bestUri = uri;
  for (const attempt of attempts) {
    const result = await ImageManipulator.manipulateAsync(
      bestUri,
      [{ resize: { width: attempt.width } }],
      { compress: attempt.compress, format: ImageManipulator.SaveFormat.JPEG },
    );
    const newSize = await getImageFileSize(result.uri);
    bestUri = result.uri;
    if (newSize <= options.maxBytes) {
      return bestUri;
    }
  }

  const emergency = options.emergency ?? { width: 480, compress: 0.2 };
  const last = await ImageManipulator.manipulateAsync(
    bestUri,
    [{ resize: { width: emergency.width } }],
    { compress: emergency.compress, format: ImageManipulator.SaveFormat.JPEG },
  );
  return last.uri;
}

/** Profile photos (~2 MB cap). */
export const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;

export async function optimizeProfilePhoto(uri: string): Promise<string> {
  return optimizePhotoToMaxBytes(uri, { maxBytes: MAX_PROFILE_PHOTO_BYTES });
}

/** Business card logos (~1.5 MB cap). */
export const MAX_LOGO_BYTES = 1_500_000;

export async function optimizeBusinessLogo(uri: string): Promise<string> {
  const normalized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG },
  );
  return optimizePhotoToMaxBytes(normalized.uri, {
    maxBytes: MAX_LOGO_BYTES,
    attempts: [
      { width: 800, compress: 0.78 },
      { width: 640, compress: 0.68 },
      { width: 512, compress: 0.58 },
    ],
    emergency: { width: 400, compress: 0.45 },
  });
}

export async function optimizeImageForLimit(
  uri: string,
  maxBytes: number,
): Promise<{ uri: string; size: number }> {
  const optimized = await optimizePhotoToMaxBytes(uri, { maxBytes });
  const size = await getImageFileSize(optimized);
  return { uri: optimized, size };
}
