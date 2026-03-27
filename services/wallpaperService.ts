import {
  getDownloadURL,
  listAll,
  ref,
} from 'firebase/storage';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db, storage } from '@/services/firebaseConfig';

export type WallpaperOrientation = 'vertical' | 'horizontal';
export type WallpaperTier = 'free' | 'premium';

export interface WallpaperItem {
  id: string;
  name: string;
  orientation: WallpaperOrientation;
  tier: WallpaperTier;
  fullUrl: string;
  thumbnailUrl: string;
  priceCredits: number;
  isLocked?: boolean;
  createdAt?: string;
}

const WALLPAPER_COLLECTION = 'wallpapers';

const safeFile = (name: string) =>
  String(name || 'wallpaper')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_\.]/g, '');

const toOrientation = (value: string): WallpaperOrientation =>
  String(value).toLowerCase() === 'horizontal' ? 'horizontal' : 'vertical';

const toTier = (value: string): WallpaperTier =>
  String(value).toLowerCase() === 'premium' ? 'premium' : 'free';

async function isUserPremium(userId: string): Promise<boolean> {
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) {
      return false;
    }
    return Boolean(userSnap.data()?.isPremium);
  } catch {
    return false;
  }
}

async function isSuperAdmin(userId: string): Promise<boolean> {
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) {
      return false;
    }
    return String(userSnap.data()?.role || '') === 'super_admin';
  } catch {
    return false;
  }
}

export function getWallpaperFolderPaths() {
  return [
    'assets/wallpapers/vertical/common/full',
    'assets/wallpapers/vertical/common/thumbs',
    'assets/wallpapers/vertical/legendary/full',
    'assets/wallpapers/vertical/legendary/thumbs',
    'assets/wallpapers/horizontal/common/full',
    'assets/wallpapers/horizontal/common/thumbs',
    'assets/wallpapers/horizontal/legendary/full',
    'assets/wallpapers/horizontal/legendary/thumbs',
    'assets/skins/default/',
  ];
}

export async function getAvailableWallpapers(
  userId: string,
  orientation: WallpaperOrientation,
): Promise<WallpaperItem[]> {
  const tiers: WallpaperTier[] = ['free', 'premium'];

  const fromFirestore = await listWallpapersFromFirestore(orientation, tiers);
  if (fromFirestore.length > 0) {
    return fromFirestore.map((wall) => ({
      ...wall,
      isLocked: false,
    }));
  }

  const fromStorage = await listWallpapersFromStorage(orientation, tiers);
  return fromStorage.map((wall) => ({
    ...wall,
    isLocked: false,
  }));
}

async function listWallpapersFromFirestore(
  orientation: WallpaperOrientation,
  tiers: WallpaperTier[],
): Promise<WallpaperItem[]> {
  try {
    const snapshot = await getDocs(collection(db, WALLPAPER_COLLECTION));
    return snapshot.docs
      .map((row) => ({ id: row.id, ...row.data() } as any))
      .filter((row) =>
        Boolean(row.isActive) &&
        toOrientation(row.orientation) === orientation &&
        tiers.includes(toTier(row.tier))
      )
      .map((row) => ({
        id: String(row.id),
        name: String(row.name || 'Wallpaper'),
        orientation: toOrientation(row.orientation),
        tier: toTier(row.tier),
        fullUrl: String(row.fullUrl || ''),
        thumbnailUrl: String(row.thumbnailUrl || row.fullUrl || ''),
        priceCredits: Number(row.priceCredits || 0),
        createdAt: row.createdAt?.toDate?.()?.toISOString?.() || undefined,
      }))
      .filter((row) => Boolean(row.fullUrl) && Boolean(row.thumbnailUrl));
  } catch {
    return [];
  }
}

async function listWallpapersFromStorage(
  orientation: WallpaperOrientation,
  tiers: WallpaperTier[],
): Promise<WallpaperItem[]> {
  const wallpapers: WallpaperItem[] = [];

  for (const tier of tiers) {
    const rarity = tier === 'premium' ? 'legendary' : 'common';
    const thumbsPath = `assets/wallpapers/${orientation}/${rarity}/thumbs`;
    const fullPath = `assets/wallpapers/${orientation}/${rarity}/full`;

    try {
      const thumbsResult = await listAll(ref(storage, thumbsPath));
      const fullResult = await listAll(ref(storage, fullPath));

      const fullMap = new Map<string, string>();
      for (const fullRef of fullResult.items) {
        fullMap.set(fullRef.name, await getDownloadURL(fullRef));
      }

      for (const thumbRef of thumbsResult.items) {
        const thumbnailUrl = await getDownloadURL(thumbRef);
        const fullUrl = fullMap.get(thumbRef.name) || thumbnailUrl;

        wallpapers.push({
          id: `${orientation}-${tier}-${thumbRef.name}`,
          name: thumbRef.name.split('.')[0],
          orientation,
          tier,
          fullUrl,
          thumbnailUrl,
          priceCredits: tier === 'free' ? 0 : 40,
        });
      }
    } catch {
      // Folder may not exist yet on fresh buckets.
    }
  }

  return wallpapers;
}

export async function uploadWallpaperAsAdmin(params: {
  fileUri: string;
  fileName: string;
  orientation: WallpaperOrientation;
  tier: WallpaperTier;
  priceCredits: number;
  userId: string;
}): Promise<{ success: boolean; wallpaper?: WallpaperItem; error?: string }> {
  // ─────────────────────────────────────────────────────────────────────────
  // ARQUITECTURA: El upload va al backend (Node.js) que tiene las credenciales
  // de DO Spaces en su .env. El frontend nunca toca S3 directamente.
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const backendUrl =
      process.env.EXPO_PUBLIC_MODERATION_API_URL?.replace(/\/+$/, '') ||
      process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.replace(/\/+$/, '');

    if (!backendUrl) {
      return { success: false, error: 'EXPO_PUBLIC_MODERATION_API_URL no configurada' };
    }

    // Construir multipart/form-data
    const formData = new FormData();
    formData.append('collection', 'wallpapers');
    formData.append('name', params.fileName);
    formData.append('rarity', params.tier === 'premium' ? 'legendary' : 'common');
    formData.append('price_cs', String(params.priceCredits));
    formData.append('orientation', params.orientation);
    formData.append('ownerUid', params.userId);

    // Adjuntar archivo en el campo correcto según orientación
    const fieldName = params.orientation === 'vertical' ? 'wallpaper_vertical' : 'wallpaper_horizontal';
    formData.append(fieldName, {
      uri: params.fileUri,
      name: params.fileName,
      type: 'image/jpeg',
    } as any);

    const response = await fetch(`${backendUrl}/api/admin/mint_asset`, {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY || '',
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err?.error || `Error ${response.status}` };
    }

    const data = await response.json();

    // La respuesta del backend incluye las URLs de DO Spaces
    const fullUrl: string = data?.image_url || data?.wallpaper_vertical || data?.wallpaper_horizontal || '';
    const thumbnailUrl: string = data?.thumbnail_url || fullUrl;

    return {
      success: true,
      wallpaper: {
        id: data?.mint_id || String(Date.now()),
        name: params.fileName,
        orientation: params.orientation,
        tier: params.tier,
        fullUrl,
        thumbnailUrl,
        priceCredits: params.priceCredits,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Error subiendo wallpaper',
    };
  }
}

export function getWallpaperResizeMode() {
  // cover ensures automatic crop and fills the card frame on all aspect ratios.
  return 'cover' as const;
}

export function normalizeCardWallpaper(card: {
  wallpaperId?: string;
  wallpaperUrl?: string;
  wallpaperThumbUrl?: string;
  wallpaperTier?: WallpaperTier;
  wallpaperPriceCredits?: number;
}) {
  return {
    wallpaperId: card.wallpaperId || null,
    wallpaperUrl: card.wallpaperUrl || null,
    wallpaperThumbUrl: card.wallpaperThumbUrl || null,
    wallpaperTier: card.wallpaperTier || null,
    wallpaperPriceCredits: Number(card.wallpaperPriceCredits || 0),
  };
}
