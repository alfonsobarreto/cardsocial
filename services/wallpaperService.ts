import { ImageManipulator } from 'expo-image-manipulator';
import {
  getDownloadURL,
  listAll,
  ref,
  uploadBytes,
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
import { s3 } from './spacesClient';
import { PutObjectCommand } from '@aws-sdk/client-s3';

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
  try {
    const allowed = await isSuperAdmin(params.userId);
    if (!allowed) {
      return { success: false, error: 'Solo super_admin puede subir wallpapers' };
    }

    const timestamp = Date.now();
    const normalized = safeFile(params.fileName || `wallpaper-${timestamp}.jpg`);
    const finalName = normalized.endsWith('.jpg') || normalized.endsWith('.jpeg') || normalized.endsWith('.png')
      ? normalized
      : `${normalized}.jpg`;

    // Obtener el buffer de la imagen
    const response = await fetch(params.fileUri);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const rarity = params.tier === 'premium' ? 'legendary' : 'common';
    const fullPath = `assets/wallpapers/${params.orientation}/${rarity}/full/${timestamp}-${finalName}`;
    const thumbPath = `assets/wallpapers/${params.orientation}/${rarity}/thumbs/${timestamp}-${finalName}`;

    // Subir imagen completa
    await s3.send(new PutObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: fullPath,
      Body: buffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    }));

    // Subir thumbnail (puedes agregar lógica para generar el thumbnail si es necesario)
    await s3.send(new PutObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: thumbPath,
      Body: buffer, // Usa el mismo buffer o genera uno para el thumbnail
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    }));

    const fullUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_ENDPOINT}/${fullPath}`;
    const thumbnailUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_ENDPOINT}/${thumbPath}`;

    const docRef = await addDoc(collection(db, WALLPAPER_COLLECTION), {
      name: finalName.split('.')[0],
      orientation: params.orientation,
      tier: params.tier,
      fullUrl,
      thumbnailUrl,
      fullPath,
      thumbPath,
      priceCredits: Math.max(0, Number(params.priceCredits || 0)),
      isActive: true,
      createdBy: params.userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      success: true,
      wallpaper: {
        id: docRef.id,
        name: finalName.split('.')[0],
        orientation: params.orientation,
        tier: params.tier,
        fullUrl,
        thumbnailUrl,
        priceCredits: Math.max(0, Number(params.priceCredits || 0)),
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
