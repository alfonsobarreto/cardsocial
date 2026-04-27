import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../config/firebase';

export type FontTier = 'free' | 'premium';

export type StudioFont = {
  id: string;
  name: string;
  family: string;
  tier: FontTier;
  fileUrl: string;
  filePath?: string;
  isActive: boolean;
  createdAt?: Date | { toDate?: () => Date; seconds?: number } | null;
};

export type UploadFontInput = {
  file: File;
  displayName: string;
  tier: FontTier;
  createdBy?: string;
  createdByEmail?: string | null;
};

const FONT_COLLECTION = 'font_library';

function sanitizeName(value: string) {
  return String(value || 'font')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_.]/g, '');
}

function stripFontExtension(value: string) {
  return String(value || 'Font').replace(/\.(ttf|otf)$/i, '').trim();
}

function toTier(value: unknown): FontTier {
  return String(value).toLowerCase() === 'premium' ? 'premium' : 'free';
}

function toMillis(value: StudioFont['createdAt']) {
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

function normalizeFont(id: string, data: Partial<StudioFont>): StudioFont {
  return {
    id,
    name: String(data.name || 'Font'),
    family: String(data.family || `font-${id}`),
    tier: toTier(data.tier),
    fileUrl: String(data.fileUrl || ''),
    filePath: data.filePath ? String(data.filePath) : undefined,
    isActive: data.isActive !== false,
    createdAt: data.createdAt,
  };
}

export async function getStudioFonts(): Promise<StudioFont[]> {
  const snapshot = await getDocs(collection(db, FONT_COLLECTION));

  return snapshot.docs
    .map((item) => normalizeFont(item.id, item.data() as Partial<StudioFont>))
    .filter((font) => font.fileUrl)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function uploadStudioFont(input: UploadFontInput): Promise<StudioFont> {
  if (!/\.(ttf|otf)$/i.test(input.file.name)) {
    throw new Error('Solo se permiten fuentes .ttf o .otf');
  }

  const name = stripFontExtension(input.displayName || input.file.name);
  if (!name) {
    throw new Error('El nombre visible es obligatorio');
  }

  const timestamp = Date.now();
  const safeFileName = sanitizeName(input.file.name);
  const path = `fonts/${input.tier}/${timestamp}-${safeFileName}`;
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
    name,
    family,
    tier: input.tier,
    fileUrl,
    filePath: path,
    isActive: true,
  };
}
