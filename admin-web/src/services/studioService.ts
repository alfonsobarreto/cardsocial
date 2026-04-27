import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../config/firebase';

export type AssetTier = 'free' | 'premium';
export type AssetStatus = 'draft' | 'published';
export type AssetType = 'font' | 'icon' | 'wallpaper';

export type StudioFont = {
  id: string;
  type: 'font';
  name: string;
  family: string;
  tier: AssetTier;
  fileUrl: string;
  filePath?: string;
  isActive: boolean;
  createdAt?: Date | { toDate?: () => Date; seconds?: number } | null;
};

export type StudioVisualAsset = {
  id: string;
  type: 'icon' | 'wallpaper';
  name: string;
  tier: AssetTier;
  fileUrl: string;
  thumbnailUrl: string;
  filePath?: string;
  priceCoins: number;
  status: AssetStatus;
  isActive: boolean;
  createdAt?: Date | { toDate?: () => Date; seconds?: number } | null;
};

export type StudioAsset = StudioFont | StudioVisualAsset;

export type UploadFontInput = {
  file: File;
  displayName: string;
  tier: AssetTier;
  createdBy?: string;
  createdByEmail?: string | null;
};

export type UploadVisualAssetInput = {
  file: File;
  displayName: string;
  tier: AssetTier;
  priceCoins: number;
  status: AssetStatus;
  createdBy?: string;
  createdByEmail?: string | null;
};

const FONT_COLLECTION = 'font_library';
const ICON_COLLECTION = 'icon_library';
const WALLPAPER_COLLECTION = 'wallpaper_library';

function sanitizeName(value: string) {
  return String(value || 'asset')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_.]/g, '');
}

function stripExtension(value: string) {
  return String(value || 'Asset').replace(/\.[^/.]+$/i, '').trim();
}

function toTier(value: unknown): AssetTier {
  return String(value).toLowerCase() === 'premium' ? 'premium' : 'free';
}

function toStatus(value: unknown): AssetStatus {
  return String(value).toLowerCase() === 'published' ? 'published' : 'draft';
}

function toMillis(value: StudioAsset['createdAt']) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function getFontContentType(fileName: string) {
  if (/\.otf$/i.test(fileName)) return 'font/otf';
  return 'font/ttf';
}

function getImageContentType(fileName: string) {
  if (/\.svg$/i.test(fileName)) return 'image/svg+xml';
  if (/\.(jpg|jpeg)$/i.test(fileName)) return 'image/jpeg';
  return 'image/png';
}

function normalizeFont(id: string, data: Partial<StudioFont>): StudioFont {
  return {
    id,
    type: 'font',
    name: String(data.name || 'Font'),
    family: String(data.family || `font-${id}`),
    tier: toTier(data.tier),
    fileUrl: String(data.fileUrl || ''),
    filePath: data.filePath ? String(data.filePath) : undefined,
    isActive: data.isActive !== false,
    createdAt: data.createdAt,
  };
}

function normalizeVisualAsset(
  id: string,
  type: 'icon' | 'wallpaper',
  data: Partial<StudioVisualAsset> & Record<string, unknown>,
): StudioVisualAsset {
  const fileUrl = String(data.fileUrl || data.fullUrl || '');
  const thumbnailUrl = String(data.thumbnailUrl || data.fileUrl || data.fullUrl || '');

  return {
    id,
    type,
    name: String(data.name || (type === 'icon' ? 'Icon' : 'Wallpaper')),
    tier: toTier(data.tier),
    fileUrl,
    thumbnailUrl,
    filePath: data.filePath ? String(data.filePath) : undefined,
    priceCoins: Math.max(0, Number(data.priceCoins ?? data.priceCredits ?? 0) || 0),
    status: toStatus(data.status),
    isActive: data.isActive !== false,
    createdAt: data.createdAt as StudioVisualAsset['createdAt'],
  };
}

export async function getStudioFonts(): Promise<StudioFont[]> {
  const snapshot = await getDocs(collection(db, FONT_COLLECTION));

  return snapshot.docs
    .map((item) => normalizeFont(item.id, item.data() as Partial<StudioFont>))
    .filter((font) => font.fileUrl)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function getStudioIcons(): Promise<StudioVisualAsset[]> {
  const snapshot = await getDocs(collection(db, ICON_COLLECTION));

  return snapshot.docs
    .map((item) => normalizeVisualAsset(item.id, 'icon', item.data()))
    .filter((asset) => asset.fileUrl)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function getStudioWallpapers(): Promise<StudioVisualAsset[]> {
  const snapshot = await getDocs(collection(db, WALLPAPER_COLLECTION));

  return snapshot.docs
    .map((item) => normalizeVisualAsset(item.id, 'wallpaper', item.data()))
    .filter((asset) => asset.fileUrl)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function uploadStudioFont(input: UploadFontInput): Promise<StudioFont> {
  if (!/\.(ttf|otf)$/i.test(input.file.name)) {
    throw new Error('Solo se permiten fuentes .ttf o .otf');
  }

  const name = stripExtension(input.displayName || input.file.name);
  if (!name) {
    throw new Error('El nombre visible es obligatorio');
  }

  const path = `fonts/${input.tier}/${Date.now()}-${sanitizeName(input.file.name)}`;
  const fileRef = ref(storage, path);

  await uploadBytes(fileRef, input.file, {
    contentType: getFontContentType(input.file.name),
  });

  const fileUrl = await getDownloadURL(fileRef);
  const family = `font-${input.tier}-${sanitizeName(name)}`;

  const docRef = await addDoc(collection(db, FONT_COLLECTION), {
    name,
    family,
    tier: input.tier,
    fileUrl,
    filePath: path,
    isActive: true,
    createdBy: input.createdBy ?? null,
    createdByEmail: input.createdByEmail ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    type: 'font',
    name,
    family,
    tier: input.tier,
    fileUrl,
    filePath: path,
    isActive: true,
  };
}

async function uploadVisualAsset(
  assetType: 'icon' | 'wallpaper',
  collectionName: string,
  storageRoot: 'icons' | 'wallpapers',
  input: UploadVisualAssetInput,
): Promise<StudioVisualAsset> {
  if (!/\.(png|jpe?g|svg)$/i.test(input.file.name)) {
    throw new Error('Solo se permiten imágenes .png, .jpg o .svg');
  }

  const name = stripExtension(input.displayName || input.file.name);
  if (!name) {
    throw new Error('El nombre visible es obligatorio');
  }

  const path = `${storageRoot}/${input.tier}/${Date.now()}-${sanitizeName(input.file.name)}`;
  const fileRef = ref(storage, path);

  await uploadBytes(fileRef, input.file, {
    contentType: getImageContentType(input.file.name),
  });

  const fileUrl = await getDownloadURL(fileRef);
  const priceCoins = Math.max(0, Math.floor(input.priceCoins));
  const isActive = input.status === 'published';

  const payload = {
    name,
    tier: input.tier,
    fileUrl,
    thumbnailUrl: fileUrl,
    filePath: path,
    priceCoins,
    priceCredits: priceCoins,
    status: input.status,
    isActive,
    createdBy: input.createdBy ?? null,
    createdByEmail: input.createdByEmail ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, collectionName), {
    ...payload,
    ...(assetType === 'wallpaper' ? { fullUrl: fileUrl, orientation: 'vertical' } : {}),
  });

  return {
    id: docRef.id,
    type: assetType,
    name,
    tier: input.tier,
    fileUrl,
    thumbnailUrl: fileUrl,
    filePath: path,
    priceCoins,
    status: input.status,
    isActive,
  };
}

export function uploadStudioIcon(input: UploadVisualAssetInput): Promise<StudioVisualAsset> {
  return uploadVisualAsset('icon', ICON_COLLECTION, 'icons', input);
}

export function uploadStudioWallpaper(input: UploadVisualAssetInput): Promise<StudioVisualAsset> {
  return uploadVisualAsset('wallpaper', WALLPAPER_COLLECTION, 'wallpapers', input);
}
