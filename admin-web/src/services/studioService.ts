import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
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

export type AdminPublishIconSource =
  | { kind: 'file'; file: File }
  | { kind: 'url'; url: string };

export type PublishAdminIconInput = {
  source: AdminPublishIconSource;
  name: string;
  folder: string;
  priceDiamonds: number;
  priceCoins: number;
  style: string;
  shape: string;
  createdBy?: string;
  createdByEmail?: string | null;
};

function guessImageExtFromMime(mime: string) {
  if (/png/i.test(mime)) return 'png';
  if (/svg/i.test(mime)) return 'svg';
  if (/webp/i.test(mime)) return 'webp';
  return 'jpg';
}

async function adminSourceToFile(source: AdminPublishIconSource): Promise<File> {
  if (source.kind === 'file') {
    if (!/\.(png|jpe?g|svg|webp)$/i.test(source.file.name)) {
      throw new Error('Solo se permiten imagenes .png, .jpg, .svg o .webp.');
    }
    return source.file;
  }

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen IA (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  const ext = guessImageExtFromMime(blob.type);
  return new File([blob], `ai-icon-${Date.now()}.${ext}`, { type: blob.type || `image/${ext}` });
}

export async function publishAdminStudioIcon(input: PublishAdminIconInput): Promise<StudioVisualAsset> {
  const name = stripExtension(input.name).trim();
  if (!name) throw new Error('El nombre del icono es obligatorio.');

  const folder = input.folder.trim() || 'general';
  const file = await adminSourceToFile(input.source);

  const safeFolder = sanitizeName(folder);
  const path = `icons/${safeFolder}/${Date.now()}-${sanitizeName(file.name)}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: getImageContentType(file.name) });

  const fileUrl = await getDownloadURL(fileRef);
  const priceDiamonds = Math.max(0, Math.round(Number(input.priceDiamonds) || 0));
  const priceCoins = Math.max(0, Math.floor(Number(input.priceCoins) || 0));

  const docRef = await addDoc(collection(db, ICON_COLLECTION), {
    name,
    folder,
    fileUrl,
    thumbnailUrl: fileUrl,
    imageUrl: fileUrl,
    filePath: path,
    priceCoins,
    priceCredits: priceCoins,
    priceDiamonds,
    style: input.style,
    shape: input.shape,
    tier: 'premium',
    status: 'published',
    isActive: true,
    createdBy: input.createdBy ?? null,
    createdByEmail: input.createdByEmail ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    type: 'icon',
    name,
    tier: 'premium',
    fileUrl,
    thumbnailUrl: fileUrl,
    filePath: path,
    priceCoins,
    status: 'published',
    isActive: true,
  };
}

// ── The Forge: themes, icon_packs, skins (Firestore + Storage) ─────────────

const THEMES_COLLECTION = 'studio_themes';
const ICON_PACKS_COLLECTION = 'studio_icon_packs';
const SKINS_COLLECTION = 'studio_skins';

export type StudioBackgroundMode = 'solid' | 'gradient' | 'image';

export type StudioThemeDoc = {
  id: string;
  name: string;
  /** @deprecated usar campos forge; se mantiene para docs viejos */
  backgroundColor: string;
  backgroundMode: StudioBackgroundMode;
  solidColor: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  wallpaperUrl: string | null;
  glassBlurPx: number;
  glassOpacity: number;
  /** @deprecated alias de btnBg */
  primaryColor: string;
  btnBg: string;
  btnBorder: string;
  btnText: string;
  btnRadius: number;
  btnBorderWidth: number;
  btnGlow: boolean;
  secondaryColor: string;
  textColor: string;
  borderRadiusPx: number;
  fontLibraryId: string | null;
  fontFamilyCss: string | null;
  googleFontFamily: string | null;
  fontSizeBase: number;
  createdAt?: StudioFont['createdAt'];
  updatedAt?: StudioFont['createdAt'];
};

export type StudioIconPackDoc = {
  id: string;
  name: string;
  icons: Array<{ url: string; fileName: string }>;
  iconBorderRadiusPx: number;
  iconSizePx: number;
  iconContainerBg: string;
  createdAt?: StudioFont['createdAt'];
  updatedAt?: StudioFont['createdAt'];
};

export type StudioSkinDoc = {
  id: string;
  name: string;
  priceCoins: number;
  priceDiamonds: number;
  tier: AssetTier;
  themeId: string;
  iconPackId: string;
  status: AssetStatus;
  createdAt?: StudioFont['createdAt'];
  updatedAt?: StudioFont['createdAt'];
};

export type SaveThemeInput = {
  name: string;
  backgroundMode: StudioBackgroundMode;
  solidColor: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  /** URL remota si backgroundMode === image (sin subir archivo). */
  imageUrl?: string | null;
  wallpaperUrl: string | null;
  wallpaperFile?: File | null;
  glassBlurPx: number;
  glassOpacity: number;
  btnBg: string;
  btnBorder: string;
  btnText: string;
  btnRadius: number;
  btnBorderWidth: number;
  btnGlow: boolean;
  textColor: string;
  secondaryColor: string;
  fontLibraryId: string | null;
  fontFamilyCss: string | null;
  googleFontFamily: string | null;
  fontSizeBase: number;
  createdBy?: string;
  createdByEmail?: string | null;
};

export type CreateIconPackInput = {
  name: string;
  files: File[];
  iconBorderRadiusPx: number;
  iconSizePx: number;
  iconContainerBg: string;
  createdBy?: string;
  createdByEmail?: string | null;
};

export type PublishSkinInput = {
  name: string;
  priceCoins: number;
  /** Monto en USD (diamantes); puede ser decimal. */
  priceDiamonds: number;
  tier: AssetTier;
  themeId: string;
  iconPackId: string;
  status: AssetStatus;
  createdBy?: string;
  createdByEmail?: string | null;
};

function normalizeBackgroundMode(value: unknown): StudioBackgroundMode {
  const v = String(value || '').toLowerCase();
  if (v === 'gradient' || v === 'image') return v;
  return 'solid';
}

function normalizeTheme(id: string, data: Record<string, unknown>): StudioThemeDoc {
  const legacyBg = String(data.backgroundColor || '#F2FBFF');
  const primary = String(data.primaryColor || data.btnBg || '#0D4D8A');
  const btnBg = String(data.btnBg ?? data.primaryColor ?? '#0D4D8A');
  return {
    id,
    name: String(data.name || 'Theme'),
    backgroundColor: legacyBg,
    backgroundMode: normalizeBackgroundMode(data.backgroundMode),
    solidColor: String(data.solidColor ?? data.backgroundColor ?? '#F2FBFF'),
    gradientFrom: String(data.gradientFrom || '#1e3a5f'),
    gradientTo: String(data.gradientTo || '#0f172a'),
    gradientAngle: Math.max(0, Math.min(360, Number(data.gradientAngle ?? 135) || 135)),
    wallpaperUrl: data.wallpaperUrl ? String(data.wallpaperUrl) : null,
    glassBlurPx: Math.max(0, Math.min(40, Number(data.glassBlurPx ?? data.glassBlur ?? 0) || 0)),
    glassOpacity: Math.max(0, Math.min(1, Number(data.glassOpacity ?? 0.4) || 0.4)),
    primaryColor: primary,
    btnBg,
    btnBorder: String(data.btnBorder || '#60a5fa'),
    btnText: String(data.btnText || '#ffffff'),
    btnRadius: Math.max(0, Math.min(50, Number(data.btnRadius ?? data.borderRadiusPx ?? 16) || 16)),
    btnBorderWidth: Math.max(0, Math.min(10, Number(data.btnBorderWidth ?? 1) || 1)),
    btnGlow: Boolean(data.btnGlow ?? false),
    secondaryColor: String(data.secondaryColor || '#C5A065'),
    textColor: String(data.textColor || '#0D4D8A'),
    borderRadiusPx: Math.max(0, Math.min(50, Number(data.borderRadiusPx ?? data.btnRadius ?? 16) || 16)),
    fontLibraryId: data.fontLibraryId ? String(data.fontLibraryId) : null,
    fontFamilyCss: data.fontFamilyCss ? String(data.fontFamilyCss) : null,
    googleFontFamily: data.googleFontFamily ? String(data.googleFontFamily) : null,
    fontSizeBase: Math.max(10, Math.min(22, Number(data.fontSizeBase ?? 15) || 15)),
    createdAt: data.createdAt as StudioThemeDoc['createdAt'],
    updatedAt: data.updatedAt as StudioThemeDoc['updatedAt'],
  };
}

function normalizeIconPack(id: string, data: Record<string, unknown>): StudioIconPackDoc {
  const iconsRaw = data.icons;
  const icons: StudioIconPackDoc['icons'] = [];
  if (Array.isArray(iconsRaw)) {
    for (const row of iconsRaw) {
      if (row && typeof row === 'object') {
        const o = row as Record<string, unknown>;
        const url = String(o.url || '');
        if (url) icons.push({ url, fileName: String(o.fileName || 'icon') });
      }
    }
  }
  return {
    id,
    name: String(data.name || 'Pack'),
    icons,
    iconBorderRadiusPx: Math.max(0, Math.min(50, Number(data.iconBorderRadiusPx ?? 12) || 12)),
    iconSizePx: Math.max(16, Math.min(64, Number(data.iconSizePx ?? 28) || 28)),
    iconContainerBg: String(data.iconContainerBg || 'rgba(255,255,255,0.12)'),
    createdAt: data.createdAt as StudioIconPackDoc['createdAt'],
    updatedAt: data.updatedAt as StudioIconPackDoc['updatedAt'],
  };
}

function normalizeSkin(id: string, data: Record<string, unknown>): StudioSkinDoc {
  return {
    id,
    name: String(data.name || 'Skin'),
    priceCoins: Math.max(0, Math.floor(Number(data.priceCoins ?? 0) || 0)),
    priceDiamonds: Math.max(0, Number(data.priceDiamonds ?? 0) || 0),
    tier: toTier(data.tier),
    themeId: String(data.themeId || ''),
    iconPackId: String(data.iconPackId || ''),
    status: toStatus(data.status),
    createdAt: data.createdAt as StudioSkinDoc['createdAt'],
    updatedAt: data.updatedAt as StudioSkinDoc['updatedAt'],
  };
}

export async function listStudioThemes(): Promise<StudioThemeDoc[]> {
  const snapshot = await getDocs(collection(db, THEMES_COLLECTION));
  return snapshot.docs
    .map((d) => normalizeTheme(d.id, d.data()))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function listStudioIconPacks(): Promise<StudioIconPackDoc[]> {
  const snapshot = await getDocs(collection(db, ICON_PACKS_COLLECTION));
  return snapshot.docs
    .map((d) => normalizeIconPack(d.id, d.data()))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function listStudioSkins(): Promise<StudioSkinDoc[]> {
  const snapshot = await getDocs(collection(db, SKINS_COLLECTION));
  return snapshot.docs
    .map((d) => normalizeSkin(d.id, d.data()))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function saveStudioTheme(input: SaveThemeInput): Promise<StudioThemeDoc> {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('El nombre del theme es obligatorio.');

  let wallpaperUrl = input.wallpaperUrl;
  if (input.wallpaperFile && input.wallpaperFile.size > 0) {
    const f = input.wallpaperFile;
    if (!/\.(png|jpe?g|webp|svg)$/i.test(f.name)) {
      throw new Error('Wallpaper: solo .png, .jpg, .webp o .svg');
    }
    const path = `studio_themes/wallpapers/${Date.now()}-${sanitizeName(f.name)}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, f, { contentType: getImageContentType(f.name) });
    wallpaperUrl = await getDownloadURL(fileRef);
  } else if (input.backgroundMode === 'image' && input.imageUrl?.trim()) {
    wallpaperUrl = input.imageUrl.trim();
  }

  const solid = input.solidColor;
  const payload = {
    name,
    backgroundMode: input.backgroundMode,
    backgroundColor: solid,
    solidColor: solid,
    gradientFrom: input.gradientFrom,
    gradientTo: input.gradientTo,
    gradientAngle: input.gradientAngle,
    wallpaperUrl: wallpaperUrl || null,
    glassBlurPx: input.glassBlurPx,
    glassOpacity: input.glassOpacity,
    primaryColor: input.btnBg,
    btnBg: input.btnBg,
    btnBorder: input.btnBorder,
    btnText: input.btnText,
    btnRadius: input.btnRadius,
    btnBorderWidth: input.btnBorderWidth,
    btnGlow: input.btnGlow,
    secondaryColor: input.secondaryColor,
    textColor: input.textColor,
    borderRadiusPx: input.btnRadius,
    fontLibraryId: input.fontLibraryId || null,
    fontFamilyCss: input.fontFamilyCss || null,
    googleFontFamily: input.googleFontFamily || null,
    fontSizeBase: input.fontSizeBase,
    createdBy: input.createdBy ?? null,
    createdByEmail: input.createdByEmail ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, THEMES_COLLECTION), payload);
  return normalizeTheme(docRef.id, {
    name,
    backgroundMode: input.backgroundMode,
    backgroundColor: solid,
    solidColor: solid,
    gradientFrom: input.gradientFrom,
    gradientTo: input.gradientTo,
    gradientAngle: input.gradientAngle,
    wallpaperUrl: wallpaperUrl || null,
    glassBlurPx: input.glassBlurPx,
    glassOpacity: input.glassOpacity,
    primaryColor: input.btnBg,
    btnBg: input.btnBg,
    btnBorder: input.btnBorder,
    btnText: input.btnText,
    btnRadius: input.btnRadius,
    btnBorderWidth: input.btnBorderWidth,
    btnGlow: input.btnGlow,
    secondaryColor: input.secondaryColor,
    textColor: input.textColor,
    borderRadiusPx: input.btnRadius,
    fontLibraryId: input.fontLibraryId,
    fontFamilyCss: input.fontFamilyCss,
    googleFontFamily: input.googleFontFamily,
    fontSizeBase: input.fontSizeBase,
  } as Record<string, unknown>);
}

export async function createStudioIconPack(input: CreateIconPackInput): Promise<StudioIconPackDoc> {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('El nombre del pack es obligatorio.');
  if (!input.files?.length) throw new Error('Selecciona al menos un icono (.png / .svg).');

  const packRef = await addDoc(collection(db, ICON_PACKS_COLLECTION), {
    name,
    icons: [],
    iconBorderRadiusPx: input.iconBorderRadiusPx,
    iconSizePx: input.iconSizePx,
    iconContainerBg: input.iconContainerBg,
    createdBy: input.createdBy ?? null,
    createdByEmail: input.createdByEmail ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const icons: StudioIconPackDoc['icons'] = [];
  for (const file of input.files) {
    if (!/\.(png|jpe?g|svg|webp)$/i.test(file.name)) {
      throw new Error(`Archivo no permitido: ${file.name} (usa .png, .jpg, .svg, .webp)`);
    }
    const path = `studio_icon_packs/${packRef.id}/${Date.now()}-${sanitizeName(file.name)}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file, { contentType: getImageContentType(file.name) });
    const url = await getDownloadURL(fileRef);
    icons.push({ url, fileName: file.name });
  }

  await updateDoc(doc(db, ICON_PACKS_COLLECTION, packRef.id), {
    icons,
    iconBorderRadiusPx: input.iconBorderRadiusPx,
    iconSizePx: input.iconSizePx,
    iconContainerBg: input.iconContainerBg,
    updatedAt: serverTimestamp(),
  });

  return normalizeIconPack(packRef.id, {
    name,
    icons,
    iconBorderRadiusPx: input.iconBorderRadiusPx,
    iconSizePx: input.iconSizePx,
    iconContainerBg: input.iconContainerBg,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function publishStudioSkin(input: PublishSkinInput): Promise<StudioSkinDoc> {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('El nombre del skin es obligatorio.');
  if (!input.themeId) throw new Error('Selecciona un Theme.');
  if (!input.iconPackId) throw new Error('Selecciona un Icon Pack.');

  const status: AssetStatus = input.status === 'published' ? 'published' : 'draft';
  const payload = {
    name,
    priceCoins: Math.max(0, Math.floor(input.priceCoins)),
    priceDiamonds: Math.max(0, Number(input.priceDiamonds) || 0),
    tier: input.tier,
    themeId: input.themeId,
    iconPackId: input.iconPackId,
    status,
    isActive: status === 'published',
    createdBy: input.createdBy ?? null,
    createdByEmail: input.createdByEmail ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, SKINS_COLLECTION), payload);
  return {
    id: docRef.id,
    name,
    priceCoins: payload.priceCoins,
    priceDiamonds: payload.priceDiamonds,
    tier: input.tier,
    themeId: input.themeId,
    iconPackId: input.iconPackId,
    status,
  };
}
