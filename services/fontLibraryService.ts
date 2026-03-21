import * as Font from 'expo-font';
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, listAll, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/services/firebaseConfig';

export type FontTier = 'free' | 'premium';

export interface CardFontItem {
  id: string;
  name: string;
  family: string;
  tier: FontTier;
  fileUrl: string;
  filePath?: string;
  isLocked?: boolean;
}

const FONT_COLLECTION = 'font_library';

const sanitizeName = (value: string) =>
  String(value || 'font')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_\.]/g, '');

const toTier = (value: string): FontTier =>
  String(value).toLowerCase() === 'premium' ? 'premium' : 'free';

async function isUserPremium(userId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return false;
    return Boolean(snap.data()?.isPremium);
  } catch {
    return false;
  }
}

async function isSuperAdmin(userId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return false;
    return String(snap.data()?.role || '') === 'super_admin';
  } catch {
    return false;
  }
}

export function getFontFolderPaths() {
  return ['fonts/free', 'fonts/premium'];
}

async function listFontsFromFirestore(): Promise<CardFontItem[]> {
  try {
    const snapshot = await getDocs(collection(db, FONT_COLLECTION));
    return snapshot.docs
      .map((row) => ({ id: row.id, ...row.data() } as any))
      .filter((row) => Boolean(row.isActive) && Boolean(row.fileUrl))
      .map((row) => ({
        id: String(row.id),
        name: String(row.name || 'Font'),
        family: String(row.family || `font-${row.id}`),
        tier: toTier(row.tier),
        fileUrl: String(row.fileUrl),
        filePath: String(row.filePath || ''),
      }));
  } catch {
    return [];
  }
}

async function listFontsFromStorage(): Promise<CardFontItem[]> {
  const result: CardFontItem[] = [];

  for (const tier of ['free', 'premium'] as FontTier[]) {
    try {
      const folder = ref(storage, `fonts/${tier}`);
      const listing = await listAll(folder);
      for (const item of listing.items) {
        const url = await getDownloadURL(item);
        const baseName = item.name.replace(/\.(ttf|otf)$/i, '');
        result.push({
          id: `${tier}-${item.name}`,
          name: baseName,
          family: `font-${tier}-${baseName}`,
          tier,
          fileUrl: url,
          filePath: item.fullPath,
        });
      }
    } catch {
      // Folder may not exist yet.
    }
  }

  return result;
}

export async function getFontGallery(userId: string): Promise<CardFontItem[]> {
  const rows = await listFontsFromFirestore();
  const source = rows.length > 0 ? rows : await listFontsFromStorage();
  return source.map((font) => ({
    ...font,
    isLocked: false,
  }));
}

export async function loadDynamicFont(font: CardFontItem): Promise<string> {
  const family = String(font.family || `font-${font.id}`);
  try {
    await Font.loadAsync({
      [family]: { uri: font.fileUrl },
    });
  } catch {
    // Keep fallback system font if load fails.
  }
  return family;
}

export async function uploadFontAsAdmin(params: {
  fileUri: string;
  fileName: string;
  displayName: string;
  tier: FontTier;
  userId: string;
}): Promise<{ success: boolean; font?: CardFontItem; error?: string }> {
  try {
    const allowed = await isSuperAdmin(params.userId);
    if (!allowed) {
      return { success: false, error: 'Solo super_admin puede subir fuentes' };
    }

    const extOk = /\.(ttf|otf)$/i.test(params.fileName || '');
    if (!extOk) {
      return { success: false, error: 'Solo se permiten fuentes .ttf o .otf' };
    }

    const normalized = sanitizeName(params.fileName);
    const timestamp = Date.now();
    const path = `fonts/${params.tier}/${timestamp}-${normalized}`;
    const fileRef = ref(storage, path);

    const blob = await (await fetch(params.fileUri)).blob();
    await uploadBytes(fileRef, blob, { contentType: 'font/ttf' });
    const url = await getDownloadURL(fileRef);

    const family = `font-${params.tier}-${sanitizeName(params.displayName || normalized).replace(/\.(ttf|otf)$/i, '')}`;
    const name = String(params.displayName || normalized).replace(/\.(ttf|otf)$/i, '');

    const docRef = await addDoc(collection(db, FONT_COLLECTION), {
      name,
      family,
      tier: params.tier,
      fileUrl: url,
      filePath: path,
      isActive: true,
      createdBy: params.userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      success: true,
      font: {
        id: docRef.id,
        name,
        family,
        tier: params.tier,
        fileUrl: url,
        filePath: path,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'No se pudo subir la fuente',
    };
  }
}
